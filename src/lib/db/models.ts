import mongoose, { Schema, model, models, Document } from "mongoose";
import type { Task, IdempotencyRecord, DLQEntry, Worker } from "@/types";

// ── Task Model ────────────────────────────────────────────────────────────────
export interface TaskDocument extends Omit<Task, "_id">, Document {}

const TaskSchema = new Schema<TaskDocument>(
  {
    task_id:         { type: String, required: true, unique: true, index: true },
    idempotency_key: { type: String, required: true, unique: true, index: true },
    name:            { type: String, required: true },
    payload:         { type: Schema.Types.Mixed, default: {} },
    status:          {
      type:    String,
      enum:    ["PENDING", "CLAIMED", "COMPLETED", "FAILED", "RECOVERING"],
      default: "PENDING",
      index:   true,
    },
    priority_level:  { type: Number, min: 1, max: 5, default: 3, index: true },
    retry_count:     { type: Number, default: 0 },
    max_retries:     { type: Number, default: 5 },

    worker_id:          { type: String, default: null, index: true },
    claimed_at:         { type: Date, default: null },
    visibility_timeout: { type: Number, default: 30000 },
    last_heartbeat:     { type: Date, default: null },

    completed_at:  { type: Date, default: null },
    failed_at:     { type: Date, default: null },
    next_retry_at: { type: Date, default: null, index: true },
    error_message: { type: String, default: null },
    dlq:           { type: Boolean, default: false, index: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "__v",
  }
);

// Compound index for atomic claim query: status + priority + next_retry_at
TaskSchema.index({ status: 1, priority_level: -1, next_retry_at: 1 });
// Heartbeat monitor index: claimed tasks whose heartbeat expired
TaskSchema.index({ status: 1, last_heartbeat: 1 });
// TTL index for auto-cleanup of completed tasks (Phase 3.4)
TaskSchema.index(
  { completed_at: 1 },
  { expireAfterSeconds: parseInt(process.env.TASK_TTL || "86400") }
);

// ── Idempotency Record Model ──────────────────────────────────────────────────
export interface IdempotencyDocument extends Omit<IdempotencyRecord, "_id">, Document {}

const IdempotencySchema = new Schema<IdempotencyDocument>(
  {
    idempotency_key: { type: String, required: true, unique: true, index: true },
    task_id:         { type: String, required: true },
    result:          { type: Schema.Types.Mixed },
    expires_at:      { type: Date, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

// TTL index — Mongo auto-deletes expired idempotency keys (Phase 3.4)
IdempotencySchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// ── Dead Letter Queue Model ───────────────────────────────────────────────────
export interface DLQDocument extends Omit<DLQEntry, "_id">, Document {}

const DLQSchema = new Schema<DLQDocument>(
  {
    task_id:       { type: String, required: true, index: true },
    original_task: { type: Schema.Types.Mixed, required: true },
    reason:        { type: String, required: true },
    moved_at:      { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// ── Worker Registration Model ─────────────────────────────────────────────────
export interface WorkerDocument extends Omit<Worker, "_id" | "worker_id"> & { worker_id: string }, Document {}

const WorkerSchema = new Schema<WorkerDocument>(
  {
    worker_id:    { type: String, required: true, unique: true, index: true },
    status:       { type: String, enum: ["IDLE", "BUSY", "DEAD"], default: "IDLE" },
    current_task: { type: String, default: null },
    started_at:   { type: Date, default: Date.now },
    last_seen:    { type: Date, default: Date.now },
    tasks_done:   { type: Number, default: 0 },
    tasks_failed: { type: Number, default: 0 },
  },
  { timestamps: false }
);

// TTL: auto-remove dead workers after 1 hour
WorkerSchema.index({ last_seen: 1 }, { expireAfterSeconds: 3600 });

// ── Export models (prevent re-compile in dev hot-reload) ──────────────────────
export const TaskModel = (models.Task as mongoose.Model<TaskDocument>) ||
  model<TaskDocument>("Task", TaskSchema);

export const IdempotencyModel =
  (models.Idempotency as mongoose.Model<IdempotencyDocument>) ||
  model<IdempotencyDocument>("Idempotency", IdempotencySchema);

export const DLQModel = (models.DLQ as mongoose.Model<DLQDocument>) ||
  model<DLQDocument>("DLQ", DLQSchema);

export const WorkerModel = (models.Worker as mongoose.Model<WorkerDocument>) ||
  model<WorkerDocument>("Worker", WorkerSchema);