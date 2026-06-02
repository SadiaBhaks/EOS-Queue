#!/usr/bin/env node
require("dotenv").config({ path: ".env.local" });

const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");

const DATABASE_URL    = process.env.DATABASE_URL;
const CONCURRENCY     = Math.min(parseInt(process.env.WORKER_CONCURRENCY || "2"), 5);
const HEARTBEAT_MS    = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL   || "10000");
const VISIBILITY_MS   = parseInt(process.env.WORKER_VISIBILITY_TIMEOUT   || "60000");
const BASE_DELAY      = parseInt(process.env.RETRY_BASE_DELAY             || "1000");
const MAX_DELAY       = parseInt(process.env.RETRY_MAX_DELAY              || "60000");
const IDEM_TTL_SEC    = parseInt(process.env.IDEMPOTENCY_TTL_SECONDS      || "604800");
const POLL_INTERVAL   = 2000;
const ZOMBIE_INTERVAL = 30000;
const IDLE_KEEPALIVE  = 10000;

let isShuttingDown = false;

const pool = new Pool({
  connectionString: DATABASE_URL,
  max:              CONCURRENCY + 2,
  ssl:              { rejectUnauthorized: false },
});

function calcBackoff(retryCount) {
  const exp    = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY);
  const jitter = Math.random() * exp * 0.3;
  return Math.floor(exp + jitter);
}

// ── Atomic Claim ──────────────────────────────────────────────────────────────
async function claim(workerId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(`
      SELECT * FROM tasks
      WHERE dlq = FALSE
        AND (
          (status = 'PENDING'    AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
          OR
          (status = 'RECOVERING' AND next_retry_at <= NOW())
        )
      ORDER BY priority_level DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const task = result.rows[0];
    await client.query(`
      UPDATE tasks SET
        status = 'CLAIMED', worker_id = $1,
        claimed_at = NOW(), last_heartbeat = NOW()
      WHERE task_id = $2
    `, [workerId, task.task_id]);

    await client.query("COMMIT");

    pool.query(`
      INSERT INTO workers (worker_id, status, current_task, last_seen)
      VALUES ($1, 'BUSY', $2, NOW())
      ON CONFLICT (worker_id) DO UPDATE
        SET status = 'BUSY', current_task = $2, last_seen = NOW()
    `, [workerId, task.task_id]).catch(() => {});

    return task;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Complete ──────────────────────────────────────────────────────────────────
async function complete(taskId, workerId, result) {
  const taskRes = await pool.query(
    `SELECT * FROM tasks WHERE task_id = $1 AND worker_id = $2`,
    [taskId, workerId]
  );
  if (taskRes.rows.length === 0) return;

  const task = taskRes.rows[0];
  const exp  = new Date(Date.now() + IDEM_TTL_SEC * 1000);

  await pool.query(`
    INSERT INTO idempotency_records (idempotency_key, task_id, result, expires_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (idempotency_key) DO NOTHING
  `, [task.idempotency_key, taskId, JSON.stringify(result), exp]);

  await pool.query(`
    UPDATE tasks SET status = 'COMPLETED', completed_at = NOW(), worker_id = NULL
    WHERE task_id = $1 AND worker_id = $2
  `, [taskId, workerId]);

  pool.query(`
    UPDATE workers SET status = 'IDLE', current_task = NULL,
      last_seen = NOW(), tasks_done = tasks_done + 1
    WHERE worker_id = $1
  `, [workerId]).catch(() => {});
}

// ── Fail ──────────────────────────────────────────────────────────────────────
async function fail(taskId, workerId, error) {
  const taskRes = await pool.query(
    `SELECT * FROM tasks WHERE task_id = $1 AND worker_id = $2`,
    [taskId, workerId]
  );
  if (taskRes.rows.length === 0) return;

  const task          = taskRes.rows[0];
  const newRetryCount = task.retry_count + 1;

  if (newRetryCount > task.max_retries) {
    await pool.query(`
      INSERT INTO dlq_entries (task_id, original_task, reason)
      VALUES ($1, $2, $3)
    `, [taskId, JSON.stringify(task), error]);

    await pool.query(`
      UPDATE tasks SET status = 'FAILED', failed_at = NOW(),
        error_message = $1, worker_id = NULL, dlq = TRUE
      WHERE task_id = $2
    `, [error, taskId]);
  } else {
    const delay  = calcBackoff(newRetryCount);
    const nextAt = new Date(Date.now() + delay);
    await pool.query(`
      UPDATE tasks SET status = 'PENDING', retry_count = $1,
        next_retry_at = $2, error_message = $3,
        worker_id = NULL, claimed_at = NULL
      WHERE task_id = $4
    `, [newRetryCount, nextAt, error, taskId]);
  }

  pool.query(`
    UPDATE workers SET status = 'IDLE', current_task = NULL,
      last_seen = NOW(), tasks_failed = tasks_failed + 1
    WHERE worker_id = $1
  `, [workerId]).catch(() => {});
}

// ── Simulated Task Handler ─────────────────────────────────────────────────────
async function handleTask(task) {
  const delay = Math.floor(Math.random() * 2000) + 500;
  await new Promise((r) => setTimeout(r, delay));
  if (Math.random() < 0.15) throw new Error(`Simulated error for ${task.task_id}`);
  return { processed_at: new Date().toISOString(), duration_ms: delay };
}

// ── Worker Slot ───────────────────────────────────────────────────────────────
async function runSlot(workerId) {
  // ── Register immediately on startup ──────────────────────────────────────
  await pool.query(`
    INSERT INTO workers (worker_id, status, current_task, last_seen)
    VALUES ($1, 'IDLE', NULL, NOW())
    ON CONFLICT (worker_id) DO UPDATE
      SET status = 'IDLE', last_seen = NOW()
  `, [workerId]).catch(() => {});

  // ── Keepalive — update last_seen every 10s even when idle ─────────────────
  const keepalive = setInterval(() => {
    if (isShuttingDown) { clearInterval(keepalive); return; }
    pool.query(
      `UPDATE workers SET last_seen = NOW() WHERE worker_id = $1`,
      [workerId]
    ).catch(() => {});
  }, IDLE_KEEPALIVE);

  let consecutiveErrors = 0;

  while (!isShuttingDown) {
    try {
      const task = await claim(workerId);

      if (!task) {
        consecutiveErrors = 0;
        // Mark IDLE when no tasks available
        pool.query(
          `UPDATE workers SET status = 'IDLE', current_task = NULL,
             last_seen = NOW() WHERE worker_id = $1`,
          [workerId]
        ).catch(() => {});
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        continue;
      }

      consecutiveErrors = 0;
      console.log(`[${workerId}] Claimed: ${task.name} (${task.task_id.slice(0, 8)})`);

      let heartbeatActive = true;
      const hbInterval = setInterval(async () => {
        if (!heartbeatActive) return;
        pool.query(
          `UPDATE tasks SET last_heartbeat = NOW()
           WHERE task_id = $1 AND worker_id = $2 AND status = 'CLAIMED'`,
          [task.task_id, workerId]
        ).catch(() => {});
        pool.query(
          `UPDATE workers SET last_seen = NOW() WHERE worker_id = $1`,
          [workerId]
        ).catch(() => {});
      }, HEARTBEAT_MS);

      try {
        const result = await handleTask(task);
        await complete(task.task_id, workerId, result);
        console.log(`[${workerId}] ✓ Completed: ${task.name}`);
      } catch (err) {
        await fail(task.task_id, workerId, err.message).catch(() => {});
        console.log(`[${workerId}] ✗ Failed: ${task.name} — ${err.message}`);
      } finally {
        heartbeatActive = false;
        clearInterval(hbInterval);
      }

    } catch (err) {
      consecutiveErrors++;
      const backoff = Math.min(2000 * Math.pow(2, consecutiveErrors - 1), 30000);
      console.error(`[${workerId}] Error #${consecutiveErrors}, backoff ${backoff}ms:`, err.message);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  clearInterval(keepalive);
  console.log(`[${workerId}] Stopped`);
}

// ── Zombie Monitor ────────────────────────────────────────────────────────────
async function zombieMonitor() {
  while (!isShuttingDown) {
    await new Promise((r) => setTimeout(r, ZOMBIE_INTERVAL));
    if (isShuttingDown) break;

    try {
      const zombies = await pool.query(`
        SELECT * FROM tasks
        WHERE status = 'CLAIMED'
          AND last_heartbeat < NOW() - (visibility_timeout || ' milliseconds')::INTERVAL
      `);

      for (const z of zombies.rows) {
        const newRetry = z.retry_count + 1;

        if (newRetry > z.max_retries) {
          await pool.query(
            `INSERT INTO dlq_entries (task_id, original_task, reason)
             VALUES ($1, $2, $3)`,
            [z.task_id, JSON.stringify(z), "Zombie: heartbeat expired"]
          );
          await pool.query(
            `UPDATE tasks SET status = 'FAILED', dlq = TRUE, worker_id = NULL
             WHERE task_id = $1 AND status = 'CLAIMED'`,
            [z.task_id]
          );
        } else {
          const nextAt = new Date(Date.now() + calcBackoff(newRetry));
          await pool.query(`
            UPDATE tasks SET
              status = 'RECOVERING', retry_count = $1,
              next_retry_at = $2, worker_id = NULL, claimed_at = NULL,
              error_message = 'Zombie recovery'
            WHERE task_id = $3 AND status = 'CLAIMED'
          `, [newRetry, nextAt, z.task_id]);
          console.log(`[ZombieMonitor] Recovered: ${z.task_id.slice(0, 8)}`);
        }

        if (z.worker_id) {
          pool.query(
            `UPDATE workers SET status = 'DEAD', current_task = NULL
             WHERE worker_id = $1`,
            [z.worker_id]
          ).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[ZombieMonitor]", err.message);
    }
  }
}

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[Worker] ${signal} — shutting down...`);
  isShuttingDown = true;
  await new Promise((r) => setTimeout(r, 5000));
  await pool.end();
  console.log("[Worker] Pool closed. Bye.");
  process.exit(0);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  EOS Queue Worker Pool (PostgreSQL)      ║`);
  console.log(`║  Concurrency: ${String(CONCURRENCY).padEnd(27)}║`);
  console.log(`║  Poll:        ${String(POLL_INTERVAL + "ms").padEnd(27)}║`);
  console.log(`║  Heartbeat:   ${String(HEARTBEAT_MS + "ms").padEnd(27)}║`);
  console.log(`║  Keepalive:   ${String(IDLE_KEEPALIVE + "ms").padEnd(27)}║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  const workerIds = Array.from({ length: CONCURRENCY }, () => `worker-${uuidv4().slice(0, 8)}`);

  // Register all workers upfront before starting slots
  for (const id of workerIds) {
    await pool.query(`
      INSERT INTO workers (worker_id, status, current_task, last_seen)
      VALUES ($1, 'IDLE', NULL, NOW())
      ON CONFLICT (worker_id) DO UPDATE
        SET status = 'IDLE', last_seen = NOW()
    `, [id]).catch(() => {});
    console.log(`[Pool] Registered: ${id}`);
  }

  const slots = workerIds.map((id) => runSlot(id));

  zombieMonitor();

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("unhandledRejection", (r) => console.error("[Worker] Unhandled:", r));

  await Promise.all(slots);
}

main().catch((err) => {
  console.error("[Worker] Fatal:", err);
  process.exit(1);
});