// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — StatusBadge Component
// ─────────────────────────────────────────────────────────────────────────────

import type { TaskStatus } from "@/types";

interface StatusBadgeProps {
  status: TaskStatus;
  size?:  "sm" | "md";
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; dot: string; className: string }> = {
  PENDING:    { label: "PENDING",    dot: "bg-text-secondary", className: "status-pending" },
  CLAIMED:    { label: "CLAIMED",    dot: "bg-accent-yellow",  className: "status-claimed" },
  COMPLETED:  { label: "COMPLETED",  dot: "bg-accent-green",   className: "status-completed" },
  FAILED:     { label: "FAILED",     dot: "bg-accent-red",     className: "status-failed" },
  RECOVERING: { label: "RECOVERING", dot: "bg-accent-orange",  className: "status-recovering" },
};

export default function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const cfg     = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  const padding = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-medium uppercase tracking-wider ${padding} ${cfg.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </span>
  );
}