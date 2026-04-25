#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Worker Process
//  Fixed: thundering herd, connection exhaustion, heartbeat flooding,
//         exponential backoff on errors, graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config({ path: ".env.local" });

const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// ── Config — conservative defaults to protect low-end machines ────────────────
const MONGODB_URI     = process.env.MONGODB_URI  ;
const CONCURRENCY     = Math.min(parseInt(process.env.WORKER_CONCURRENCY), 5); // hard cap at 5
const HEARTBEAT_MS    = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL ); // 10s (was 5s)
const VISIBILITY_MS   = parseInt(process.env.WORKER_VISIBILITY_TIMEOUT ); // 60s
const MAX_RETRIES     = parseInt(process.env.MAX_RETRY_COUNT   );
const BASE_DELAY      = parseInt(process.env.RETRY_BASE_DELAY   );
const MAX_DELAY       = parseInt(process.env.RETRY_MAX_DELAY   );
const IDEMPOTENCY_TTL = parseInt(process.env.IDEMPOTENCY_KEY_TTL    );
const POLL_INTERVAL   = 2000; // 2s between polls (was 500ms — was DDOS-ing own DB)
const ZOMBIE_INTERVAL = 30000; // 30s between zombie scans (was 10s)

// ── Graceful shutdown flag ─────────────────────────────────────────────────────
let isShuttingDown = false;

// ── Jittered Exponential Backoff ───────────────────────────────────────────────
function calcBackoff(retryCount) {
  const exp    = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY);
  const jitter = Math.random() * exp * 0.3;
  return Math.floor(exp + jitter);
}

// ── Mongoose Schemas ───────────────────────────────────────────────────────────
const TaskSchema = new mongoose.Schema({
  task_id:            { type: String, required: true, unique: true },
  idempotency_key:    { type: String, required: true },
  name:               String,
  payload:            mongoose.Schema.Types.Mixed,
  status:             { type: String, default: "PENDING" },
  priority_level:     { type: Number, default: 3 },
  retry_count:        { type: Number, default: 0 },
  max_retries:        { type: Number, default: 5 },
  worker_id:          { type: String, default: null },
  claimed_at:         { type: Date,   default: null },
  visibility_timeout: { type: Number, default: 60000 },
  last_heartbeat:     { type: Date,   default: null },
  next_retry_at:      { type: Date,   default: null },
  error_message:      { type: String, default: null },
  dlq:                { type: Boolean, default: false },
  completed_at:       { type: Date,   default: null },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });

const IdempotencySchema = new mongoose.Schema({
  idempotency_key: { type: String, unique: true },
  task_id:         String,
  result:          mongoose.Schema.Types.Mixed,
  expires_at:      Date,
}, { timestamps: { createdAt: "created_at", updatedAt: false } });

const DLQSchema = new mongoose.Schema({
  task_id:       String,
  original_task: mongoose.Schema.Types.Mixed,
  reason:        String,
  moved_at:      { type: Date, default: Date.now },
});

const WorkerSchema = new mongoose.Schema({
  worker_id:    { type: String, unique: true },
  status:       { type: String, default: "IDLE" },
  current_task: { type: String, default: null },
  started_at:   { type: Date,   default: Date.now },
  last_seen:    { type: Date,   default: Date.now },
  tasks_done:   { type: Number, default: 0 },
  tasks_failed: { type: Number, default: 0 },
});

let Task, Idempotency, DLQ, Worker;

// ── Connect — single shared pool, never reconnect inside a slot ───────────────
async function connect() {
  await mongoose.connect(MONGODB_URI, {
    maxPoolSize:             CONCURRENCY + 2, // one connection per worker + 2 spare
    minPoolSize:             1,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS:          45000,
    heartbeatFrequencyMS:    30000, // MongoDB driver heartbeat — separate from task heartbeat
  });

  // Register models once — never re-register inside loops
  Task        = mongoose.models.Task        || mongoose.model("Task",        TaskSchema);
  Idempotency = mongoose.models.Idempotency || mongoose.model("Idempotency", IdempotencySchema);
  DLQ         = mongoose.models.DLQ         || mongoose.model("DLQ",         DLQSchema);
  Worker      = mongoose.models.Worker      || mongoose.model("Worker",      WorkerSchema);

  console.log(`[Worker] MongoDB connected ✓  (pool size: ${CONCURRENCY + 2})`);
}

// ── Atomic Claim ───────────────────────────────────────────────────────────────
async function claim(workerId) {
  const now = new Date();
  const task = await Task.findOneAndUpdate(
    {
      $or: [
        { status: "PENDING",    next_retry_at: null },
        { status: "PENDING",    next_retry_at: { $lte: now } },
        { status: "RECOVERING", next_retry_at: { $lte: now } },
      ],
      dlq: false,
    },
    {
      $set: {
        status:         "CLAIMED",
        worker_id:      workerId,
        claimed_at:     now,
        last_heartbeat: now,
      },
    },
    { sort: { priority_level: -1, created_at: 1 }, new: true }
  ).lean();

  if (!task) return null;

  // Fire-and-forget worker registry update — don't await, not critical path
  Worker.findOneAndUpdate(
    { worker_id: workerId },
    { $set: { status: "BUSY", current_task: task.task_id, last_seen: now } },
    { upsert: true }
  ).catch(() => {});

  return task;
}

// ── Complete ───────────────────────────────────────────────────────────────────
async function complete(taskId, workerId, result) {
  const task = await Task.findOne({ task_id: taskId }).lean();
  if (!task || task.worker_id !== workerId) return;

  const now = new Date();

  // Write idempotency record first — this is the EOS guarantee
  await Idempotency.updateOne(
    { idempotency_key: task.idempotency_key },
    {
      $setOnInsert: {
        idempotency_key: task.idempotency_key,
        task_id:         taskId,
        result,
        created_at:      now,
        expires_at:      new Date(now.getTime() + IDEMPOTENCY_TTL),
      },
    },
    { upsert: true }
  );

  // Then mark task complete
  await Task.findOneAndUpdate(
    { task_id: taskId, worker_id: workerId },
    { $set: { status: "COMPLETED", completed_at: now, worker_id: null } }
  );

  // Fire-and-forget worker stat update
  Worker.findOneAndUpdate(
    { worker_id: workerId },
    { $set: { status: "IDLE", current_task: null, last_seen: now }, $inc: { tasks_done: 1 } }
  ).catch(() => {});
}

// ── Fail ───────────────────────────────────────────────────────────────────────
async function fail(taskId, workerId, error) {
  const task = await Task.findOne({ task_id: taskId }).lean();
  if (!task || task.worker_id !== workerId) return;

  const now           = new Date();
  const newRetryCount = task.retry_count + 1;

  if (newRetryCount > task.max_retries) {
    // Budget exhausted → DLQ
    await DLQ.create({
      task_id:       taskId,
      original_task: task,
      reason:        error,
      moved_at:      now,
    });
    await Task.findOneAndUpdate(
      { task_id: taskId },
      { $set: { status: "FAILED", failed_at: now, error_message: error, worker_id: null, dlq: true } }
    );
  } else {
    // Retry with jittered backoff
    const delay  = calcBackoff(newRetryCount);
    const nextAt = new Date(now.getTime() + delay);
    await Task.findOneAndUpdate(
      { task_id: taskId },
      {
        $set: {
          status:        "PENDING",
          retry_count:   newRetryCount,
          next_retry_at: nextAt,
          error_message: error,
          worker_id:     null,
          claimed_at:    null,
        },
      }
    );
  }

  // Fire-and-forget
  Worker.findOneAndUpdate(
    { worker_id: workerId },
    { $set: { status: "IDLE", current_task: null, last_seen: now }, $inc: { tasks_failed: 1 } }
  ).catch(() => {});
}

// ── Task Handler (Simulated Work) ──────────────────────────────────────────────
async function handleTask(task) {
  const delay = Math.floor(Math.random() * 2000) + 500; // 0.5–2.5s
  await new Promise((r) => setTimeout(r, delay));

  // Simulate ~15% failure rate
  if (Math.random() < 0.15) {
    throw new Error(`Simulated processing error for task ${task.task_id}`);
  }

  return { processed_at: new Date().toISOString(), duration_ms: delay };
}

// ── Worker Slot ────────────────────────────────────────────────────────────────
// Fixed: exponential backoff on consecutive errors prevents thundering herd
// Fixed: heartbeat uses longer interval, doesn't flood DB
// Fixed: isShuttingDown check exits cleanly
async function runSlot(workerId) {
  let consecutiveErrors = 0;

  while (!isShuttingDown) {
    try {
      const task = await claim(workerId);

      if (!task) {
        consecutiveErrors = 0; // clean poll — reset error counter
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        continue;
      }

      consecutiveErrors = 0;
      console.log(`[${workerId}] Claimed: ${task.name} (${task.task_id.slice(0, 8)})`);

      // ── Heartbeat — fires every HEARTBEAT_MS, stops on task end ──────────
      let heartbeatActive = true;
      const hbInterval = setInterval(async () => {
        if (!heartbeatActive) return;
        try {
          await Task.findOneAndUpdate(
            { task_id: task.task_id, worker_id: workerId, status: "CLAIMED" },
            { $set: { last_heartbeat: new Date() } }
          );
          await Worker.findOneAndUpdate(
            { worker_id: workerId },
            { $set: { last_seen: new Date() } }
          );
        } catch (_) {
          // Heartbeat failure is non-fatal — zombie monitor will recover
        }
      }, HEARTBEAT_MS);

      try {
        const result = await handleTask(task);
        await complete(task.task_id, workerId, result);
        console.log(`[${workerId}] ✓ Completed: ${task.name}`);
      } catch (err) {
        await fail(task.task_id, workerId, err.message).catch(() => {});
        console.log(`[${workerId}] ✗ Failed:    ${task.name} — ${err.message}`);
      } finally {
        // Always stop heartbeat — prevents interval leak
        heartbeatActive = false;
        clearInterval(hbInterval);
      }

    } catch (err) {
      consecutiveErrors++;

      // Exponential backoff on repeated errors — prevents thundering herd
      // on DB connection issues: 2s → 4s → 8s → ... capped at 30s
      const backoff = Math.min(2000 * Math.pow(2, consecutiveErrors - 1), 30000);
      console.error(
        `[${workerId}] Error #${consecutiveErrors} — backing off ${backoff}ms: ${err.message}`
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  console.log(`[${workerId}] Slot stopped (shutdown)`);
}

// ── Zombie Monitor — detects workers that died mid-task ───────────────────────
// Fixed: interval increased from 10s to 30s, errors don't restart the loop
async function zombieMonitor() {
  while (!isShuttingDown) {
    await new Promise((r) => setTimeout(r, ZOMBIE_INTERVAL));
    if (isShuttingDown) break;

    try {
      const now     = new Date();
      const zombies = await Task.find({
        status: "CLAIMED",
        $expr: {
          $lt: [
            "$last_heartbeat",
            { $subtract: [now, "$visibility_timeout"] },
          ],
        },
      }).lean();

      if (zombies.length > 0) {
        console.log(`[ZombieMonitor] Found ${zombies.length} zombie task(s)`);
      }

      for (const z of zombies) {
        const newRetry = z.retry_count + 1;

        if (newRetry > z.max_retries) {
          await DLQ.create({
            task_id:       z.task_id,
            original_task: z,
            reason:        "Zombie: heartbeat expired, retry budget exhausted",
            moved_at:      now,
          });
          await Task.findOneAndUpdate(
            { task_id: z.task_id },
            { $set: { status: "FAILED", dlq: true, worker_id: null } }
          );
          console.log(`[ZombieMonitor] → DLQ: ${z.task_id.slice(0, 8)}