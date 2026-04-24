// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — TaskTable Component
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import StatusBadge from "@/components/ui/StatusBadge";
import type { Task, TaskStatus } from "@/types";
import { formatDistanceToNow } from "date-fns";

const PRIORITY_COLORS = ["", "text-text-muted", "text-text-secondary", "text-accent-yellow/70", "text-accent-orange", "text-accent-red"];
const PRIORITY_LABELS = ["", "LOW", "LOW", "NORMAL", "HIGH", "CRITICAL"];

const STATUS_FILTERS: Array<{ label: string; value: TaskStatus | "ALL" }> = [
  { label: "All",       value: "ALL"       },
  { label: "Pending",   value: "PENDING"   },
  { label: "Claimed",   value: "CLAIMED"   },
  { label: "Completed", value: "COMPLETED" },
  { label: "Failed",    value: "FAILED"    },
  { label: "Recovering",value: "RECOVERING"},
];

interface TaskTableProps {
  tasks: Task[];
}

export default function TaskTable({ tasks }: TaskTableProps) {
  const [filter,  setFilter]  = useState<TaskStatus | "ALL">("ALL");
  const [search,  setSearch]  = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const prevLen  = useRef(0);

  // Animate new rows
  useEffect(() => {
    if (!tableRef.current) return;
    if (tasks.length > prevLen.current) {
      const rows = tableRef.current.querySelectorAll("tr.task-row");
      const newRows = Array.from(rows).slice(0, tasks.length - prevLen.current);
      if (newRows.length > 0) {
        gsap.fromTo(newRows,
          { opacity: 0, x: -12, backgroundColor: "rgba(245,197,24,0.08)" },
          { opacity: 1, x: 0,   backgroundColor: "rgba(0,0,0,0)", duration: 0.4, stagger: 0.05, ease: "power2.out" }
        );
      }
    }
    prevLen.current = tasks.length;
  }, [tasks]);

  const filtered = tasks.filter((t) => {
    const matchStatus = filter === "ALL" || t.status === filter;
    const matchSearch = !search || t.task_id.includes(search) || t.name.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-display font-semibold text-text-primary">Task Feed</h3>
          <span className="text-xs font-mono text-text-muted bg-bg-elevated px-2 py-0.5 rounded-full">
            {filtered.length} tasks
          </span>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or ID..."
          className="bg-bg-elevated border border-border-subtle rounded-lg px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-yellow/40 w-52 transition-colors"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-5 py-2.5 border-b border-border-subtle overflow-x-auto flex-shrink-0">
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition-all ${
              filter === f.value
                ? "bg-accent-yellow/15 text-accent-yellow border border-accent-yellow/30"
                : "text-text-muted hover:text-text-secondary"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div ref={tableRef} className="overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-text-muted">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="mb-3 opacity-30">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="text-sm font-mono">No tasks found</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-5 py-3 text-left text-xs font-mono text-text-muted uppercase tracking-wider">Task</th>
                <th className="px-3 py-3 text-left text-xs font-mono text-text-muted uppercase tracking-wider">Status</th>
                <th className="px-3 py-3 text-left text-xs font-mono text-text-muted uppercase tracking-wider hidden sm:table-cell">Priority</th>
                <th className="px-3 py-3 text-left text-xs font-mono text-text-muted uppercase tracking-wider hidden md:table-cell">Retries</th>
                <th className="px-3 py-3 text-left text-xs font-mono text-text-muted uppercase tracking-wider hidden lg:table-cell">Created</th>
                <th className="px-3 py-3 text-left text-xs font-mono text-text-muted uppercase tracking-wider hidden lg:table-cell">Worker</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <>
                  <tr
                    key={task.task_id}
                    className="task-row border-b border-border-subtle/50 cursor-pointer table-row-hover transition-colors"
                    onClick={() => setExpanded(expanded === task.task_id ? null : task.task_id)}
                  >
                    <td className="px-5 py-3">
                      <div className="font-mono text-sm text-text-primary font-medium">{task.name}</div>
                      <div className="font-mono text-xs text-text-muted mt-0.5 truncate max-w-[180px]">{task.task_id}</div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-3 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1 bg-bg-elevated rounded-full overflow-hidden">
                          <div className="h-full bg-accent-yellow rounded-full" style={{ width: `${(task.priority_level / 5) * 100}%` }} />
                        </div>
                        <span className={`text-xs font-mono ${PRIORITY_COLORS[task.priority_level]}`}>
                          {PRIORITY_LABELS[task.priority_level]}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span className={`text-xs font-mono ${task.retry_count > 0 ? "text-accent-orange" : "text-text-muted"}`}>
                        {task.retry_count}/{task.max_retries}
                      </span>
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <span className="text-xs font-mono text-text-muted">
                        {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                      </span>
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      {task.worker_id ? (
                        <span className="text-xs font-mono text-accent-yellow/70 truncate max-w-[100px] block">
                          {task.worker_id.slice(0, 12)}...
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-text-muted">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {expanded === task.task_id && (
                    <tr key={`${task.task_id}-detail`} className="bg-bg-elevated/50">
                      <td colSpan={6} className="px-5 py-4">
                        <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                          <div>
                            <p className="text-text-muted mb-1 uppercase tracking-wider text-[10px]">Payload</p>
                            <pre className="text-text-secondary bg-bg-surface rounded-lg p-3 overflow-x-auto text-xs max-h-24">
                              {JSON.stringify(task.payload, null, 2)}
                            </pre>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <p className="text-text-muted mb-1 uppercase tracking-wider text-[10px]">Idempotency Key</p>
                              <p className="text-text-secondary">{task.idempotency_key}</p>
                            </div>
                            {task.error_message && (
                              <div>
                                <p className="text-accent-red/70 mb-1 uppercase tracking-wider text-[10px]">Last Error</p>
                                <p className="text-accent-red text-xs">{task.error_message}</p>
                              </div>
                            )}
                            {task.next_retry_at && (
                              <div>
                                <p className="text-text-muted mb-1 uppercase tracking-wider text-[10px]">Next Retry</p>
                                <p className="text-accent-orange">{formatDistanceToNow(new Date(task.next_retry_at), { addSuffix: true })}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}