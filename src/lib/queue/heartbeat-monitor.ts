// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Heartbeat Monitor
//  Phase 2.4: Background process that detects zombie workers
// ─────────────────────────────────────────────────────────────────────────────

import { broker } from "@/lib/broker";
import type { Task } from "@/types";

type RecoveryCallback = (tasks: Task[]) => void;

class HeartbeatMonitor {
  private interval:   NodeJS.Timeout | null = null;
  private isRunning:  boolean = false;
  private onRecovery: RecoveryCallback | null = null;

  readonly INTERVAL_MS = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL || "5000");

  start(onRecovery?: RecoveryCallback): void {
    if (this.isRunning) return;
    this.isRunning  = true;
    this.onRecovery = onRecovery || null;

    console.log(`[HeartbeatMonitor] Started — checking every ${this.INTERVAL_MS}ms`);

    this.interval = setInterval(async () => {
      try {
        const recovered = await broker.recoverZombies();
        if (recovered.length > 0 && this.onRecovery) {
          this.onRecovery(recovered);
        }
      } catch (err) {
        console.error("[HeartbeatMonitor] Error during zombie scan:", err);
      }
    }, this.INTERVAL_MS);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log("[HeartbeatMonitor] Stopped");
  }
}

// Singleton
export const heartbeatMonitor = new HeartbeatMonitor();