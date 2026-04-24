// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — MongoDB Broker
//  Phase 2 & 3: Core "Exactly-Once" Engine
//
//  Atomic claim uses findOneAndUpdate with a carefully crafted filter so that
//  only one worker can win the race. MongoDB's document-level locking + atomic
//  findOneAndUpdate provides the same guarantee as Redis SETNX or a SELECT FOR
//  UPDATE … SKIP LOCKED in PostgreSQL.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import connectDB from "@/lib/db/connections";
import { TaskModel, IdempotencyModel, DLQModel, WorkerModel } from "@/lib/db/models";
import type {
  IBroker,
  Task,
  CreateTaskDTO,
  QueueMetrics,
  DLQEntry,
  RetryConfig,
} from "@/types";
import { calcBackoff } from "@/types";

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries:   parseInt(process.env.MAX_RETRY_COUNT  || "5"),
  baseDelay:    parseInt(process.env.RETRY_BASE_DELAY || "1000"),
  maxDelay:     parseInt(process.env.RETRY_MAX_DELAY  || "60000"),
  jitterFactor: 0.3,
};

const VISIBILITY_TIMEOUT = parseInt(process.env.WORKER_VISIBILITY_TIMEOUT || "30000");
const IDEMPOTENCY_TTL    = parseInt(process.env.IDEMPOTENCY_KEY_TTL       || "604800000");

export class MongoDBBroker implements IBroker {
  // ── Enqueue ────────────────────────────────────────────────────────────────
  async enqueue(dto: CreateTaskDTO): Promise<Task | null> {
    await connectDB();

    const task_id         = dto.task_id         || uuidv4();
    const idempotency_key = dto.idempotency_key || task_id;

    // Idempotency check — if key already exists, return null (duplicate)
    const existing = await IdempotencyModel.findOne({ idempotency_key }).lean();
    if (existing) {
      console.log(`[Broker] Duplicate task blocked: ${idempotency_key}`);
      return null;
    }

    // Check if task_id already present in task collection
    const existingTask = await TaskModel.findOne({ task_id }).lean();
    if (existingTask) return null;

    const task = await TaskModel.create({
      task_id,
      idempotency_key,
      name:               dto.name,
      payload:            dto.payload,
      priority_level:     dto.priority_level    || 3,
      max_retries:        dto.max_retries        ?? DEFAULT_RETRY_CONFIG.maxRetries,
      visibility_timeout: dto.visibility_timeout ?? VISIBILITY_TIMEOUT,
      status:             "PENDING",
      retry_count:        0,
      worker_id:          null,
      claimed_at:         null,
      last_heartbeat:     null,
      error_message:      null,
      dlq:                false,
    });

    return task.toObject() as unknown as Task;
  }

  // ── Claim (Atomic) ─────────────────────────────────────────────────────────
  // Uses MongoDB atomic findOneAndUpdate — equivalent to a Lua script in Redis.
  // Only one worker can win because:
  //   1. Filter requires status === "PENDING" (or RECOVERING + past next_retry_at)
  //   2. MongoDB document-level write lock ensures mutual exclusion
  //   3. We immediately set status → "CLAIMED" and worker_id in the same op
  async claim(workerId: string): Promise<Task | null> {
    await connectDB();

    const now = new Date();

    const task = await TaskModel.findOneAndUpdate(
      {
        $or: [
          { status: "PENDING", next_retry_at: null },
          { status: "PENDING", next_retry_at: { $lte: now } },
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
      {
        sort:       { priority_level: -1, created_at: 1 }, // highest priority first, FIFO within
        new:        true,
        returnDocument: "after",
      }
    ).lean();

    if (!task) return null;

    // Update worker registry
    await WorkerModel.findOneAndUpdate(
      { worker_id: workerId },
      { $set: { status: "BUSY", current_task: task.task_id, last_seen: now } },
      { upsert: true }
    );

    return task as unknown as Task;
  }

  // ── Complete ───────────────────────────────────────────────────────────────
  async complete(taskId: string, workerId: string, result: unknown): Promise<void> {
    await connectDB();

    const task = await TaskModel.findOne({ task_id: taskId });
    if (!task || task.worker_id !== workerId) return;

    const now = new Date();

    // Write idempotency record FIRST (the "guarantee" record)
    await IdempotencyModel.updateOne(
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

    // Mark task completed
    await TaskModel.findOneAndUpdate(
      { task_id: taskId, worker_id: workerId },
      {
        $set: {
          status:       "COMPLETED",
          completed_at: now,
          worker_id:    null,
        },
      }
    );

    // Free up worker slot
    await WorkerModel.findOneAndUpdate(
      { worker_id: workerId },
      { $set: { status: "IDLE", current_task: null, last_seen: now }, $inc: { tasks_done: 1 } }
    );
  }

  // ── Fail ───────────────────────────────────────────────────────────────────
  async fail(taskId: string, workerId: string, error: string): Promise<void> {
    await connectDB();

    const task = await TaskModel.findOne({ task_id: taskId });
    if (!task || task.worker_id !== workerId) return;

    const now         = new Date();
    const newRetryCount = task.retry_count + 1;

    if (newRetryCount > task.max_retries) {
      // Route to Dead Letter Queue
      await DLQModel.create({
        task_id:       taskId,
        original_task: task.toObject(),
        reason:        error,
        moved_at:      now,
      });

      await TaskModel.findOneAndUpdate(
        { task_id: taskId },
        {
          $set: {
            status:        "FAILED",
            failed_at:     now,
            error_message: error,
            worker_id:     null,
            dlq:           true,
          },
        }
      );
    } else {
      // Schedule retry with jittered backoff
      const delay      = calcBackoff(newRetryCount, DEFAULT_RETRY_CONFIG);
      const next_retry = new Date(now.getTime() + delay);

      await TaskModel.findOneAndUpdate(
        { task_id: taskId },
        {
          $set: {
            status:        "PENDING",
            retry_count:   newRetryCount,
            next_retry_at: next_retry,
            error_message: error,
            worker_id:     null,
            claimed_at:    null,
          },
        }
      );
    }

    // Update worker stats
    await WorkerModel.findOneAndUpdate(
      { worker_id: workerId },
      { $set: { status: "IDLE", current_task: null, last_seen: now }, $inc: { tasks_failed: 1 } }
    );
  }

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  async heartbeat(taskId: string, workerId: string): Promise<void> {
    await connectDB();
    const now = new Date();

    await TaskModel.findOneAndUpdate(
      { task_id: taskId, worker_id: workerId, status: "CLAIMED" },
      { $set: { last_heartbeat: now } }
    );

    await WorkerModel.findOneAndUpdate(
      { worker_id: workerId },
      { $set: { last_seen: now } }
    );
  }

  // ── Recover Zombies ────────────────────────────────────────────────────────
  // Called by the heartbeat monitor background process.
  // Finds tasks whose last_heartbeat is older than visibility_timeout.
  async recoverZombies(): Promise<Task[]> {
    await connectDB();

    const now = new Date();

    // Find zombie tasks — claimed but heartbeat expired
    const zombies = await TaskModel.find({
      status: "CLAIMED",
      $expr: {
        $lt: [
          "$last_heartbeat",
          {
            $subtract: [now, "$visibility_timeout"],
          },
        ],
      },
    }).lean();

    const recovered: Task[] = [];

    for (const zombie of zombies) {
      const newRetryCount = zombie.retry_count + 1;

      if (newRetryCount > zombie.max_retries) {
        // Too many retries — DLQ
        await DLQModel.create({
          task_id:       zombie.task_id,
          original_task: zombie,
          reason:        "Zombie: worker died, retry budget exhausted",
          moved_at:      now,
        });
        await TaskModel.findOneAndUpdate(
          { task_id: zombie.task_id },
          { $set: { status: "FAILED", dlq: true, worker_id: null } }
        );
      } else {
        const delay  = calcBackoff(newRetryCount, DEFAULT_RETRY_CONFIG);
        const nextAt = new Date(now.getTime() + delay);

        await TaskModel.findOneAndUpdate(
          { task_id: zombie.task_id, status: "CLAIMED" }, // double-check still claimed
          {
            $set: {
              status:        "RECOVERING",
              retry_count:   newRetryCount,
              next_retry_at: nextAt,
              worker_id:     null,
              claimed_at:    null,
              error_message: "Zombie recovery: heartbeat expired",
            },
          }
        );
        recovered.push(zombie as unknown as Task);
      }

      // Mark the ghost worker as DEAD
      if (zombie.worker_id) {
        await WorkerModel.findOneAndUpdate(
          { worker_id: zombie.worker_id },
          { $set: { status: "DEAD", current_task: null } }
        );
      }
    }

    if (recovered.length > 0) {
      console.log(`[Broker] Recovered ${recovered.length} zombie task(s)`);
    }

    return recovered;
  }

  // ── Metrics ────────────────────────────────────────────────────────────────
  async getMetrics(): Promise<QueueMetrics> {
    await connectDB();

    const [statusCounts, dlqCount, workers, recentCompleted] = await Promise.all([
      TaskModel.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      DLQModel.countDocuments(),
      WorkerModel.find({ status: { $ne: "DEAD" } }).lean(),
      TaskModel.find({
        status:       "COMPLETED",
        completed_at: { $gte: new Date(Date.now() - 60_000) },
      }).lean(),
    ]);

    const counts: Record<string, number> = {};
    for (const { _id, count } of statusCounts) counts[_id] = count;

    // Avg latency for recently completed tasks
    let avgLatency = 0;
    if (recentCompleted.length > 0) {
      const latencies = recentCompleted
        .filter((t) => t.completed_at && t.created_at)
        .map((t) => new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime());
      avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    }

    return {
      pending:        counts["PENDING"]    || 0,
      claimed:        counts["CLAIMED"]    || 0,
      completed:      counts["COMPLETED"]  || 0,
      failed:         counts["FAILED"]     || 0,
      recovering:     counts["RECOVERING"] || 0,
      dlq:            dlqCount,
      throughput:     recentCompleted.length / 60,
      avg_latency:    Math.round(avgLatency),
      active_workers: workers.filter((w) => w.status === "BUSY").length,
      total_tasks:    Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }

  // ── List Tasks ────────────────────────────────────────────────────────────
  async listTasks(
    filter: Partial<{ status: string; limit: number; offset: number }> = {}
  ): Promise<Task[]> {
    await connectDB();

    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;

    const tasks = await TaskModel.find(query)
      .sort({ created_at: -1 })
      .limit(filter.limit || 50)
      .skip(filter.offset || 0)
      .lean();

    return tasks as unknown as Task[];
  }

  // ── List DLQ ──────────────────────────────────────────────────────────────
  async listDLQ(limit = 50): Promise<DLQEntry[]> {
    await connectDB();
    const entries = await DLQModel.find().sort({ moved_at: -1 }).limit(limit).lean();
    return entries as unknown as DLQEntry[];
  }
}

// Singleton export
export const broker = new MongoDBBroker();