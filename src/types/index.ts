

// ── Task Lifecycle States ─────────────────────────────────────────────────────
export type TaskStatus =
  | "PENDING"     // Enqueued, waiting to be claimed
  | "CLAIMED"     // Locked by a worker, processing in progress
  | "COMPLETED"   // Successfully processed (idempotency record written)
  | "FAILED"      // Exhausted retry budget — moved to DLQ
  | "RECOVERING"; // Zombie detected; re-queued by heartbeat monitor

export const TASK_STATUS: Record<TaskStatus, TaskStatus> = {
  PENDING:    "PENDING",
  CLAIMED:    "CLAIMED",
  COMPLETED:  "COMPLETED",
  FAILED:     "FAILED",
  RECOVERING: "RECOVERING",
};

// ── Priority Levels ───────────────────────────────────────────────────────────
export type PriorityLevel = 1 | 2 | 3 | 4 | 5; // 5 = highest

// ── Core Task Payload ─────────────────────────────────────────────────────────
export interface Task {
  _id:             string;          // MongoDB ObjectId as string
  task_id:         string;          // Client-generated UUID (idempotency key)
  idempotency_key: string;          // Unique key (defaults to task_id)
  name:            string;          // Human-readable task name
  payload:         Record<string, unknown>; // Arbitrary task data
  status:          TaskStatus;

  priority_level:  PriorityLevel;   // 1–5; workers pop highest first
  retry_count:     number;          // Times task has been retried
  max_retries:     number;          // Ceiling (default: 5)

  worker_id:       string | null;   // ID of the worker currently holding the task
  claimed_at:      Date | null;     // When the current worker claimed it
  visibility_timeout: number;       // Milliseconds before a claim expires
  last_heartbeat:  Date | null;     // Last keepalive from the worker

  created_at:      Date;
  updated_at:      Date;
  completed_at:    Date | null;
  failed_at:       Date | null;
  next_retry_at:   Date | null;

  error_message:   string | null;   // Last failure reason
  dlq:             boolean;         // true once moved to Dead Letter Queue
}

// ── Create Task DTO (Producer input) ─────────────────────────────────────────
export interface CreateTaskDTO {
  task_id?:        string;          // Client SHOULD supply; server generates if absent
  idempotency_key?: string;
  name:            string;
  payload:         Record<string, unknown>;
  priority_level?: PriorityLevel;
  max_retries?:    number;
  visibility_timeout?: number;
}

// ── Worker Registration ───────────────────────────────────────────────────────
export interface Worker {
  worker_id:    string;
  status:       "IDLE" | "BUSY" | "DEAD";
  current_task: string | null;
  started_at:   Date;
  last_seen:    Date;
  tasks_done:   number;
  tasks_failed: number;
}

// ── Idempotency Record ────────────────────────────────────────────────────────
export interface IdempotencyRecord {
  _id:           string;
  idempotency_key: string;
  task_id:       string;
  result:        unknown;
  created_at:    Date;
  expires_at:    Date;
}

// ── Dead Letter Queue Entry ───────────────────────────────────────────────────
export interface DLQEntry {
  _id:           string;
  task_id:       string;
  original_task: Task;
  reason:        string;
  moved_at:      Date;
}

// ── Metrics ───────────────────────────────────────────────────────────────────
export interface QueueMetrics {
  pending:    number;
  claimed:    number;
  completed:  number;
  failed:     number;
  recovering: number;
  dlq:        number;
  throughput: number; // tasks/sec (last 60s)
  avg_latency: number; // ms from PENDING → COMPLETED
  active_workers: number;
  total_tasks:   number;
}

// ── WebSocket Events ──────────────────────────────────────────────────────────
export type WSEventType =
  | "TASK_CREATED"
  | "TASK_CLAIMED"
  | "TASK_COMPLETED"
  | "TASK_FAILED"
  | "TASK_RECOVERING"
  | "TASK_DLQ"
  | "WORKER_JOINED"
  | "WORKER_LEFT"
  | "METRICS_UPDATE"
  | "HEARTBEAT";

export interface WSEvent<T = unknown> {
  type:      WSEventType;
  payload:   T;
  timestamp: string;
}

// ── Broker Interface (Phase 1.1) ──────────────────────────────────────────────
export interface IBroker {
  /**  Atomically enqueue a task. Returns false if idempotency_key already exists. */
  enqueue(dto: CreateTaskDTO): Promise<Task | null>;

  /**  Atomically claim the next available task for a given worker. */
  claim(workerId: string): Promise<Task | null>;

  /**  Acknowledge successful completion and write idempotency record. */
  complete(taskId: string, workerId: string, result: unknown): Promise<void>;

  /**  Mark as failed; schedule retry or route to DLQ. */
  fail(taskId: string, workerId: string, error: string): Promise<void>;

  /**  Touch the heartbeat timestamp for a claimed task. */
  heartbeat(taskId: string, workerId: string): Promise<void>;

  /**  Recover zombie tasks whose heartbeat has expired. */
  recoverZombies(): Promise<Task[]>;

  /**  Fetch live metrics snapshot. */
  getMetrics(): Promise<QueueMetrics>;

  /**  Fetch tasks for dashboard with optional filters. */
  listTasks(filter?: Partial<{ status: TaskStatus; limit: number; offset: number }>): Promise<Task[]>;

  /**  Fetch DLQ entries. */
  listDLQ(limit?: number): Promise<DLQEntry[]>;
}

// ── Retry Config (Phase 1.4) ──────────────────────────────────────────────────
export interface RetryConfig {
  maxRetries:   number;   // default: 5
  baseDelay:    number;   // ms — default: 1000
  maxDelay:     number;   // ms — default: 60000
  jitterFactor: number;   // 0–1 — default: 0.3
}

/**
 * Jittered Exponential Backoff
 * t_wait = min(base * 2^n, maxDelay) + random_jitter
 */
export function calcBackoff(retryCount: number, config: RetryConfig): number {
  const exp   = Math.min(config.baseDelay * Math.pow(2, retryCount), config.maxDelay);
  const jitter = Math.random() * exp * config.jitterFactor;
  return Math.floor(exp + jitter);
}