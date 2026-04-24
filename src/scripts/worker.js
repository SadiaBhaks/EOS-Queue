#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Worker Process
//  Phase 2.2: Standalone worker that can be run alongside the Next.js server
//  Usage: node scripts/worker.js [--concurrency=5]
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config({ path: ".env.local" });

const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// ── Config ─────────────────────────────────────────────────────────────────────
const MONGODB_URI    = process.env.MONGODB_URI    || "mongodb://localhost:27017/eos_queue";
const CONCURRENCY    = parseInt(process.env.WORKER_CONCURRENCY || "5");
const HEARTBEAT_MS   = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL || "5000");
const VISIBILITY_MS  = parseInt(process.env.WORKER_VISIBILITY_TIMEOUT || "30000");
const MAX_RETRIES    = parseInt(process.env.MAX_RETRY_COUNT   || "5");
const BASE_DELAY     = parseInt(process.env.RETRY_BASE_DELAY  || "1000");
const MAX_DELAY      = parseInt(process.env.RETRY_MAX_DELAY   || "60000");
const IDEMPOTENCY_TTL = parseInt(process.env.IDEMPOTENCY_KEY_TTL || "604800000");
const POLL_INTERVAL   = 500; // ms

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
  visibility_timeout: { type: Number, default: 30000 },
  last_heartbeat:     { type: Date,   default: null },
  next_retry_at:      { type: Date,   default: null },
  error_message:      { type: String, default: null },
  dlq:                { type: Boolean, default: false },
  completed_at:       { type: Date,   default: null },
},
{ timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });

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

// ── Connect ────────────────────────────────────────────────────────────────────
async function connect() {
  await mongoose.connect(MONGODB_URI, { maxPoolSize: CONCURRENCY + 2 });
  Task        = mongoose.models.Task        || mongoose.model("Task",        TaskSchema);
  Idempotency = mongoose.models.Idempotency || mongoose.model("Idempotency", IdempotencySchema);
  DLQ         = mongoose.models.DLQ         || mongoose.model("DLQ",         DLQSchema);
  Worker      = mongoose.models.Worker      || mongoose.model("Worker",      WorkerSchema);
  console.log(`[Worker] MongoDB connected ✓`);
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

  await Worker.findOneAndUpdate(
    { worker_id: workerId },
    { $set: { status: "BUSY", current_task: task.task_id, last_seen: now } },
    { upsert: true }
  );
  return task;
}

// ── Complete ────────────────────────────────────────────────────────────────────
async function complete(taskId, workerId, result) {
  const task = await Task.findOne({ task_id: taskId });
  if (!task || task.worker_id !== workerId) return;
  const now = new Date();

  await Idempotency.updateOne(
    { idempotency_key: task.idempotency_key },
    { $setOnInsert: {
        idempotency_key: task.idempotency_key,
        task_id:         taskId,
        result,
        created_at:      now,
        expires_at:      new Date(now.getTime() + IDEMPOTENCY_TTL),
    }},
    { upsert: true }
  );

  await Task.findOneAndUpdate(
    { task_id: taskId, worker_id: workerId },
    { $set: { status: "COMPLETED", completed_at: now, worker_id: null } }
  );

  await Worker.findOneAndUpdate(
    { worker_id: workerId },
    { $set: { status: "IDLE", current_task: null, last_seen: now }, $inc: { tasks_done: 1 } }
  );
}

// ── Fail ────────────────────────────────────────────────────────────────────────
async function fail(taskId, workerId, error) {
  const task = await Task.findOne({ task_id: taskId });
  if (!task || task.worker_id !== workerId) return;
  const now           = new Date();
  const newRetryCount = task.retry_count + 1;

  if (newRetryCount > task.max_retries) {
    await DLQ.create({ task_id: taskId, original_task: task.toObject(), reason: error, moved_at: now });
    await Task.findOneAndUpdate({ task_id: taskId }, {
      $set: { status: "FAILED", failed_at: now, error_message: error, worker_id: null, dlq: true },
    });
  } else {
    const delay  = calcBackoff(newRetryCount);
    const nextAt = new Date(now.getTime() + delay);
    await Task.findOneAndUpdate({ task_id: taskId }, {
      $set: {
        status: "PENDING", retry_count: newRetryCount,
        next_retry_at: nextAt, error_message: error,
        worker_id: null, claimed_at: null,
      },
    });
  }

  await Worker.findOneAndUpdate(
    { worker_id: workerId },
    { $set: { status: "IDLE", current_task: null, last_seen: now }, $inc: { tasks_failed: 1 } }
  );
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
async function runSlot(workerId) {
  while (true) {
    try {
      const task = await claim(workerId);
      if (!task) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        continue;
      }

      console.log(`[${workerId}] Claimed: ${task.name} (${task.task_id.slice(0,8)})`);

      // Heartbeat
      const hbInterval = setInterval(async () => {
        await Task.findOneAndUpdate(
          { task_id: task.task_id, worker_id: workerId, status: "CLAIMED" },
          { $set: { last_heartbeat: new Date() } }
        );
        await Worker.findOneAndUpdate({ worker_id: workerId }, { $set: { last_seen: new Date() } });
      }, HEARTBEAT_MS);

      try {
        const result = await handleTask(task);
        await complete(task.task_id, workerId, result);
        console.log(`[${workerId}] ✓ Completed: ${task.name}`);
      } catch (err) {
        await fail(task.task_id, workerId, err.message);
        console.log(`[${workerId}] ✗ Failed:    ${task.name} — ${err.message}`);
      } finally {
        clearInterval(hbInterval);
      }
    } catch (err) {
      console.error(`[${workerId}] Slot error:`, err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// ── Zombie Monitor ─────────────────────────────────────────────────────────────
async function zombieMonitor() {
  while (true) {
    await new Promise((r) => setTimeout(r, 10000));
    try {
      const now     = new Date();
      const zombies = await Task.find({
        status: "CLAIMED",
        $expr: { $lt: ["$last_heartbeat", { $subtract: [now, "$visibility_timeout"] }] },
      }).lean();

      for (const z of zombies) {
        const newRetry = z.retry_count + 1;
        if (newRetry > z.max_retries) {
          await DLQ.create({ task_id: z.task_id, original_task: z, reason: "Zombie: heartbeat expired", moved_at: now });
          await Task.findOneAndUpdate({ task_id: z.task_id }, { $set: { status: "FAILED", dlq: true, worker_id: null } });
        } else {
          const nextAt = new Date(now.getTime() + calcBackoff(newRetry));
          await Task.findOneAndUpdate(
            { task_id: z.task_id, status: "CLAIMED" },
            { $set: { status: "RECOVERING", retry_count: newRetry, next_retry_at: nextAt, worker_id: null, claimed_at: null, error_message: "Zombie recovery" } }
          );
          console.log(`[ZombieMonitor] Recovered: ${z.task_id.slice(0,8)}`);
        }
        if (z.worker_id) {
          await Worker.findOneAndUpdate({ worker_id: z.worker_id }, { $set: { status: "DEAD", current_task: null } });
        }
      }
    } catch (err) {
      console.error("[ZombieMonitor]", err.message);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  await connect();

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  EOS Queue Worker Pool                   ║`);
  console.log(`║  Concurrency: ${String(CONCURRENCY).padEnd(27)}║`);
  console.log(`║  Heartbeat:   ${String(HEARTBEAT_MS + "ms").padEnd(27)}║`);
  console.log(`║  Visibility:  ${String(VISIBILITY_MS + "ms").padEnd(27)}║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  // Launch worker slots
  const slots = Array.from({ length: CONCURRENCY }, (_, i) => {
    const id = `worker-${uuidv4().slice(0, 8)}`;
    console.log(`[Pool] Starting slot ${i + 1}/${CONCURRENCY}: ${id}`);
    return runSlot(id);
  });

  // Launch zombie monitor
  zombieMonitor();

  // Handle graceful shutdown
  process.on("SIGTERM", () => { console.log("\n[Worker] SIGTERM — shutting down"); process.exit(0); });
  process.on("SIGINT",  () => { console.log("\n[Worker] SIGINT — shutting down");  process.exit(0); });

  await Promise.all(slots);
}

main().catch((err) => { console.error("[Worker] Fatal:", err); process.exit(1); });