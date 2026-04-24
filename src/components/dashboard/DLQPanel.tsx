// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — DLQPanel Component
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { DLQEntry } from "@/types";

export default function DLQPanel() {
  const [entries, setEntries] = useState<DLQEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDLQ = async () => {
    try {
      const res = await fetch("/api/dlq?limit=20");
      const { entries: e } = await res.json();
      setEntries(e || []);
    } catch (_) {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchDLQ();
    const id = setInterval(fetchDLQ, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-accent-red animate-pulse" />
          <h3 className="font-display font-semibold text-text-primary">Dead Letter Queue</h3>
        </div>
        <span className="text-xs font-mono text-accent-red bg-accent-red/10 border border-accent-red/20 px-2 py-0.5 rounded-full">
          {entries.length} entries
        </span>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 shimmer rounded-xl" />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted">
            <div className="text-3xl mb-2">✓</div>
            <span className="text-sm font-mono text-accent-green">DLQ is empty</span>
            <span className="text-xs font-mono mt-1 opacity-60">All tasks completed successfully</span>
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry._id} className="bg-accent-red/5 border border-accent-red/20 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-accent-red font-medium">
                  {(entry.original_task as { name?: string })?.name ?? "unknown"}
                </span>
                <span className="text-[10px] font-mono text-text-muted">
                  {formatDistanceToNow(new Date(entry.moved_at), { addSuffix: true })}
                </span>
              </div>
              <p className="text-[10px] font-mono text-text-muted truncate">{entry.task_id}</p>
              {entry.reason && (
                <p className="text-[10px] font-mono text-accent-red/70 bg-accent-red/5 rounded px-2 py-1">
                  {entry.reason}
                </p>
              )}
              <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
                <span>Retries: {(entry.original_task as { retry_count?: number })?.retry_count ?? 0}</span>
                <span>·</span>
                <span>Max: {(entry.original_task as { max_retries?: number })?.max_retries ?? 5}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}