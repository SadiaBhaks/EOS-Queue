// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Worker Pool
//  Phase 2.2: Concurrent task processing with heartbeat keepalive
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import { broker } from "@/lib/broker";
import type { Task } from "@/types";

export type TaskHandler = (task: Task) => Promise<unknown>;

interface WorkerPoolOptions {
  concurrency:         number;
  pollIntervalMs:      number;
  heartbeatIntervalMs: number;
  handler:             TaskHandler;
  onTaskStart?:        (task: Task, workerId: string) => void;
  onTaskComplete?:     (task: Task, workerId: string, result: unknown) => void;
  onTaskFail?:         (task: Task, workerId: string, error: string) => void;
  onZombieRecovered?:  (tasks: Task[]) => void;
}

interface WorkerSlot {
  id:         string;
  busy:       boolean;
  currentTask: string | null;
}

export class WorkerPool {
  private slots:          WorkerSlot[];
  private pollInterval:   NodeJS.Timeout | null = null;
  private heartbeats:     Map<string, NodeJS.Timeout> = new Map();
  private running:        boolean = false;
  private opts:           WorkerPoolOptions;

  constructor(opts: WorkerPoolOptions) {
    this.opts  = opts;
    this.slots = Array.from({ length: opts.concurrency }, (_, i) => ({
      id:          `worker-${uuidv4().slice(0, 8)}`,
      busy:        false,
      currentTask: null,
    }));
  }

  get workerIds(): string[] {
    return this.slots.map((s) => s.id);
  }

  get activeCount(): number {
    return this.slots.filter((s) => s.busy).length;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`[WorkerPool] Starting ${this.opts.concurrency} workers`);
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.heartbeats.forEach((t) => clearInterval(t));
    this.heartbeats.clear();
    console.log("[WorkerPool] Stopped");
  }

  private poll(): void {
    this.pollInterval = setInterval(async () => {
      if (!this.running) return;

      const idleSlots = this.slots.filter((s) => !s.busy);
      const claims    = idleSlots.map((slot) => this.tryClaimAndProcess(slot));
      await Promise.allSettled(claims);
    }, this.opts.pollIntervalMs);
  }

  private async tryClaimAndProcess(slot: WorkerSlot): Promise<void> {
    if (slot.busy) return;

    const task = await broker.claim(slot.id).catch(() => null);
    if (!task) return;

    slot.busy        = true;
    slot.currentTask = task.task_id;

    this.opts.onTaskStart?.(task, slot.id);

    // Start heartbeat for this task
    const hbInterval = setInterval(async () => {
      await broker.heartbeat(task.task_id, slot.id).catch(() => {});
    }, this.opts.heartbeatIntervalMs);
    this.heartbeats.set(task.task_id, hbInterval);

    try {
      const result = await this.opts.handler(task);
      await broker.complete(task.task_id, slot.id, result);
      this.opts.onTaskComplete?.(task, slot.id, result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await broker.fail(task.task_id, slot.id, msg).catch(() => {});
      this.opts.onTaskFail?.(task, slot.id, msg);
    } finally {
      clearInterval(hbInterval);
      this.heartbeats.delete(task.task_id);
      slot.busy        = false;
      slot.currentTask = null;
    }
  }
}