// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — PostgreSQL Broker
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import { pool } from "@/lib/db/connections";
import { initSchema } from "@/lib/db/models";
import type { IBroker, Task, CreateTaskDTO, QueueMetrics, DLQEntry } from "@/types";
import { calcBackoff } from "@/types";

const DEFAULT_RETRY  = { maxRetries: 5, baseDelay: 1000, maxDelay: 60000, jitterFactor: 0.3 };
const VISIBILITY_MS  = parseInt(process.env.WORKER_VISIBILITY_TIMEOUT  || "60000");
const IDEM_TTL_SEC   = parseInt(process.env.IDEMPOTENCY_TTL_SECONDS    || "604800");

let schemaReady = false;

async function ensureSchema() {
  if (!schemaReady) { await initSchema(); schemaReady = true; }
}

function rowToTask(r: Record<string, unknown>): Task {
  return {
    _id:                String(r.id),
    task_id:            r.task_id as string,
    idempotency_key:    r.idempotency_key as string,
    name:               r.name as string,
    payload:            r.payload as Record<string, unknown>,
    status:             r.status as Task["status"],
    priority_level:     r.priority_level as Task["priority_level"],
    retry_count:        r.retry_count as number,
    max_retries:        r.max_retries as number,
    worker_id:          r.worker_id as string | null,
    claimed_at:         r.claimed_at ? new Date(r.claimed_at as string) : null,
    visibility_timeout: r.visibility_timeout as number,
    last_heartbeat:     r.last_heartbeat ? new Date(r.last_heartbeat as string) : null,
    completed_at:       r.completed_at ? new Date(r.completed_at as string) : null,
    failed_at:          r.failed_at ? new Date(r.failed_at as string) : null,
    next_retry_at:      r.next_retry_at ? new Date(r.next_retry_at as string) : null,
    error_message:      r.error_message as string | null,
    dlq:                r.dlq as boolean,
    created_at:         new Date(r.created_at as string),
    updated_at:         new Date(r.updated_at as string),
  };
}

export class PostgreSQLBroker implements IBroker {

  // ── Enqueue ──────────────────────────────────────────────────────────────────
  async enqueue(dto: CreateTaskDTO): Promise<Task | null> {
    await ensureSchema();

    const task_id         = dto.task_id         || uuidv4();
    const idempotency_key = dto.idempotency_key || task_id;

    const existing = await pool.query(
      `SELECT task_id FROM idempotency_records WHERE idempotency_key = $1`,
      [idempotency_key]
    );
    if (existing.rows.length > 0) {
      console.log(`[Broker] Duplicate blocked: ${idempotency_key}`);
      return null;
    }

    const result = await pool.query(
      `INSERT INTO tasks
         (task_id, idempotency_key, name, payload, priority_level,
          max_retries, visibility_timeout, status, retry_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',0)
       ON CONFLICT (task_id) DO NOTHING
       RETURNING *`,
      [
        task_id,
        idempotency_key,
        dto.name,
        JSON.stringify(dto.payload || {}),
        dto.priority_level    || 3,
        dto.max_retries        ?? DEFAULT_RETRY.maxRetries,
        dto.visibility_timeout ?? VISIBILITY_MS,
      ]
    );

    if (result.rows.length === 0) return null;
    return rowToTask(result.rows[0]);
  }

  // ── Claim ────────────────────────────────────────────────────────────────────
  async claim(workerId: string): Promise<Task | null> {
    await ensureSchema();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `SELECT * FROM tasks
         WHERE dlq = FALSE
           AND (
             (status = 'PENDING'    AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
             OR
             (status = 'RECOVERING' AND next_retry_at <= NOW())
           )
         ORDER BY priority_level DESC, created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      const row = result.rows[0];
      const now = new Date();

      await client.query(
        `UPDATE tasks SET
           status = 'CLAIMED',
           worker_id = $1,
           claimed_at = $2,
           last_heartbeat = $2
         WHERE task_id = $3`,
        [workerId, now, row.task_id]
      );

      await client.query("COMMIT");

      pool.query(
        `INSERT INTO workers (worker_id, status, current_task, last_seen)
         VALUES ($1, 'BUSY', $2, NOW())
         ON CONFLICT (worker_id) DO UPDATE
           SET status = 'BUSY', current_task = $2, last_seen = NOW()`,
        [workerId, row.task_id]
      ).catch(() => {});

      return rowToTask({
        ...row,
        status:         "CLAIMED",
        worker_id:      workerId,
        claimed_at:     now,
        last_heartbeat: now,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Complete ─────────────────────────────────────────────────────────────────
  async complete(taskId: string, workerId: string, result: unknown): Promise<void> {
    await ensureSchema();

    const taskRes = await pool.query(
      `SELECT * FROM tasks WHERE task_id = $1 AND worker_id = $2`,
      [taskId, workerId]
    );
    if (taskRes.rows.length === 0) return;

    const task = taskRes.rows[0];
    const now  = new Date();
    const exp  = new Date(now.getTime() + IDEM_TTL_SEC * 1000);

    await pool.query(
      `INSERT INTO idempotency_records
         (idempotency_key, task_id, result, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [task.idempotency_key, taskId, JSON.stringify(result), exp]
    );

    await pool.query(
      `UPDATE tasks SET status = 'COMPLETED', completed_at = $1, worker_id = NULL
       WHERE task_id = $2 AND worker_id = $3`,
      [now, taskId, workerId]
    );

    pool.query(
      `UPDATE workers SET status = 'IDLE', current_task = NULL,
         last_seen = NOW(), tasks_done = tasks_done + 1
       WHERE worker_id = $1`,
      [workerId]
    ).catch(() => {});
  }

  // ── Fail ─────────────────────────────────────────────────────────────────────
  async fail(taskId: string, workerId: string, error: string): Promise<void> {
    await ensureSchema();

    const taskRes = await pool.query(
      `SELECT * FROM tasks WHERE task_id = $1 AND worker_id = $2`,
      [taskId, workerId]
    );
    if (taskRes.rows.length === 0) return;

    const task          = taskRes.rows[0];
    const now           = new Date();
    const newRetryCount = task.retry_count + 1;

    if (newRetryCount > task.max_retries) {
      await pool.query(
        `INSERT INTO dlq_entries (task_id, original_task, reason, moved_at)
         VALUES ($1, $2, $3, $4)`,
        [taskId, JSON.stringify(task), error, now]
      );
      await pool.query(
        `UPDATE tasks SET status = 'FAILED', failed_at = $1,
           error_message = $2, worker_id = NULL, dlq = TRUE
         WHERE task_id = $3`,
        [now, error, taskId]
      );
    } else {
      const delay  = calcBackoff(newRetryCount, DEFAULT_RETRY);
      const nextAt = new Date(now.getTime() + delay);
      await pool.query(
        `UPDATE tasks SET status = 'PENDING', retry_count = $1,
           next_retry_at = $2, error_message = $3,
           worker_id = NULL, claimed_at = NULL
         WHERE task_id = $4`,
        [newRetryCount, nextAt, error, taskId]
      );
    }

    pool.query(
      `UPDATE workers SET status = 'IDLE', current_task = NULL,
         last_seen = NOW(), tasks_failed = tasks_failed + 1
       WHERE worker_id = $1`,
      [workerId]
    ).catch(() => {});
  }

  // ── Heartbeat ────────────────────────────────────────────────────────────────
  async heartbeat(taskId: string, workerId: string): Promise<void> {
    await pool.query(
      `UPDATE tasks SET last_heartbeat = NOW()
       WHERE task_id = $1 AND worker_id = $2 AND status = 'CLAIMED'`,
      [taskId, workerId]
    );
    pool.query(
      `UPDATE workers SET last_seen = NOW() WHERE worker_id = $1`,
      [workerId]
    ).catch(() => {});
  }

  // ── Recover Zombies ──────────────────────────────────────────────────────────
  async recoverZombies(): Promise<Task[]> {
    await ensureSchema();

    const zombies = await pool.query(
      `SELECT * FROM tasks
       WHERE status = 'CLAIMED'
         AND last_heartbeat < NOW() - (visibility_timeout || ' milliseconds')::INTERVAL`
    );

    const recovered: Task[] = [];

    for (const z of zombies.rows) {
      const now      = new Date();
      const newRetry = z.retry_count + 1;

      if (newRetry > z.max_retries) {
        await pool.query(
          `INSERT INTO dlq_entries (task_id, original_task, reason, moved_at)
           VALUES ($1, $2, $3, $4)`,
          [z.task_id, JSON.stringify(z), "Zombie: heartbeat expired", now]
        );
        await pool.query(
          `UPDATE tasks SET status = 'FAILED', dlq = TRUE, worker_id = NULL
           WHERE task_id = $1 AND status = 'CLAIMED'`,
          [z.task_id]
        );
      } else {
        const nextAt = new Date(now.getTime() + calcBackoff(newRetry, DEFAULT_RETRY));
        const res = await pool.query(
          `UPDATE tasks SET
             status = 'RECOVERING', retry_count = $1,
             next_retry_at = $2, worker_id = NULL, claimed_at = NULL,
             error_message = 'Zombie recovery: heartbeat expired'
           WHERE task_id = $3 AND status = 'CLAIMED'
           RETURNING *`,
          [newRetry, nextAt, z.task_id]
        );
        if (res.rows.length > 0) {
          recovered.push(rowToTask(res.rows[0]));
          console.log(`[Broker] Recovered zombie: ${z.task_id.slice(0, 8)}`);
        }
      }

      if (z.worker_id) {
        pool.query(
          `UPDATE workers SET status = 'DEAD', current_task = NULL
           WHERE worker_id = $1`,
          [z.worker_id]
        ).catch(() => {});
      }
    }

    return recovered;
  }

  // ── Metrics ──────────────────────────────────────────────────────────────────
  async getMetrics(): Promise<QueueMetrics> {
    await ensureSchema();

    const [statusRes, dlqRes, throughputRes, latencyRes, workersRes] = await Promise.all([
      pool.query(`SELECT status, COUNT(*)::int as count FROM tasks GROUP BY status`),
      pool.query(`SELECT COUNT(*)::int as count FROM dlq_entries`),
      pool.query(
        `SELECT COUNT(*)::int as count FROM tasks
         WHERE status = 'COMPLETED'
           AND completed_at > NOW() - INTERVAL '60 seconds'`
      ),
      pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)::int as avg_ms
         FROM tasks
         WHERE status = 'COMPLETED'
           AND completed_at > NOW() - INTERVAL '60 seconds'`
      ),
      // ── Count all non-dead workers seen in last hour ──
      pool.query(
        `SELECT COUNT(*)::int as count FROM workers
         WHERE status != 'DEAD'
           AND last_seen > NOW() - INTERVAL '1 hour'`
      ),
    ]);

    const counts: Record<string, number> = {};
    for (const r of statusRes.rows) counts[r.status] = r.count;

    return {
      pending:        counts["PENDING"]    || 0,
      claimed:        counts["CLAIMED"]    || 0,
      completed:      counts["COMPLETED"]  || 0,
      failed:         counts["FAILED"]     || 0,
      recovering:     counts["RECOVERING"] || 0,
      dlq:            dlqRes.rows[0]?.count    || 0,
      throughput:     (throughputRes.rows[0]?.count || 0) / 60,
      avg_latency:    latencyRes.rows[0]?.avg_ms   || 0,
      active_workers: workersRes.rows[0]?.count    || 0,
      total_tasks:    Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }

  // ── List Tasks ───────────────────────────────────────────────────────────────
  async listTasks(
    filter: Partial<{ status: string; limit: number; offset: number }> = {}
  ): Promise<Task[]> {
    await ensureSchema();

    const conditions: string[] = [];
    const values:     unknown[] = [];
    let   idx = 1;

    if (filter.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filter.status);
    }

    const where  = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit  = filter.limit  || 50;
    const offset = filter.offset || 0;

    values.push(limit, offset);
    const result = await pool.query(
      `SELECT * FROM tasks ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
    );

    return result.rows.map(rowToTask);
  }

  // ── List DLQ ─────────────────────────────────────────────────────────────────
  async listDLQ(limit = 50): Promise<DLQEntry[]> {
    await ensureSchema();

    const result = await pool.query(
      `SELECT * FROM dlq_entries ORDER BY moved_at DESC LIMIT $1`,
      [limit]
    );

    return result.rows.map((r) => ({
      _id:           String(r.id),
      task_id:       r.task_id,
      original_task: r.original_task,
      reason:        r.reason,
      moved_at:      new Date(r.moved_at),
    }));
  }
}

export const broker = new PostgreSQLBroker();