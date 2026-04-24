// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — WorkersPanel Component
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface WorkerEntry {
  worker_id:    string;
  status:       "IDLE" | "BUSY" | "DEAD";
  current_task: string | null;
  tasks_done:   number;
  tasks_failed: number;
  last_seen:    string;
}

export default function WorkersPanel() {
  const [workers, setWorkers] = useState<WorkerEntry[]>([]);

  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        const res = await fetch("/api/workers");
        const { workers: w } = await res.json();
        setWorkers(w || []);
      } catch (_) {}
    };

    fetchWorkers();
    const id = setInterval(fetchWorkers, 5000);
    return () => clearInterval(id);
  }, []);

  const STATUS_CONFIG = {
    IDLE: { dot: "pulse-dot-green",  label: "IDLE",  text: "text-accent-green"  },
    BUSY: { dot: "pulse-dot-yellow", label: "BUSY",  text: "text-accent-yellow" },
    DEAD: { dot: "pulse-dot-red",    label: "DEAD",  text: "text-accent-red"    },
  };

  return (
    <div className="card flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle flex-shrink-0">
        <h3 className="font-display font-semibold text-text-primary">Worker Registry</h3>
        <span className="text-xs font-mono text-accent-green bg-accent-green/10 border border-accent-green/20 px-2 py-0.5 rounded-full">
          {workers.filter((w) => w.status !== "DEAD").length} active
        </span>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-2">
        {workers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted">
            <div className="text-2xl mb-2 opacity-30">⚙</div>
            <span className="text-sm font-mono">No workers registered</span>
            <span className="text-xs font-mono mt-1 opacity-60">Run: npm run worker</span>
          </div>
        ) : (
          workers.map((w) => {
            const cfg = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.IDLE;
            return (
              <div key={w.worker_id} className="bg-bg-elevated border border-border-subtle rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`pulse-dot ${cfg.dot}`} />
                    <span className="font-mono text-xs text-text-primary font-medium truncate max-w-[140px]">
                      {w.worker_id}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold uppercase ${cfg.text}`}>
                    {cfg.label}
                  </span>
                </div>

                {w.current_task && (
                  <div className="bg-bg-surface rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-text-muted font-mono uppercase tracking-wider mb-0.5">Processing</p>
                    <p className="text-xs text-accent-yellow font-mono truncate">{w.current_task}</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-text-muted font-mono">Done</p>
                    <p className="text-sm font-bold font-mono text-accent-green">{w.tasks_done}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted font-mono">Failed</p>
                    <p className="text-sm font-bold font-mono text-accent-red">{w.tasks_failed}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted font-mono">Seen</p>
                    <p className="text-[10px] font-mono text-text-secondary">
                      {formatDistanceToNow(new Date(w.last_seen), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}