"use client";

import type { QueueMetrics, Task } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  PENDING:    "#94A3B8",
  CLAIMED:    "#F5C518",
  COMPLETED:  "#10B981",
  FAILED:     "#EF4444",
  RECOVERING: "#F97316",
};

const NODES = [
  { id: "producer",  label: "PRODUCER",  color: "#8B5CF6", countKey: null },
  { id: "pending",   label: "PENDING",   color: "#94A3B8", countKey: "pending" },
  { id: "claimed",   label: "CLAIMED",   color: "#F5C518", countKey: "claimed" },
  { id: "completed", label: "COMPLETED", color: "#10B981", countKey: "completed" },
  { id: "sink",      label: "SINK",      color: "#06B6D4", countKey: null },
];

const NODE_CX = [70, 195, 320, 445, 570];
const CY = 90;
const R  = 30;

interface Props { metrics: QueueMetrics; tasks: Task[] }

export default function PipelineVisualization({ metrics, tasks }: Props) {
  const getCount = (key: string | null): number | null => {
    if (!key) return null;
    return (metrics as unknown as Record<string, number>)[key] ?? 0;
  };

  const taskDots = tasks.slice(0, 50);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 select-none overflow-hidden">

      {/* ── SVG Pipeline ───────────────────────────────────────────────── */}
      <svg viewBox="0 0 640 210" className="w-full" style={{ maxHeight: 190 }}>
        <defs>
          {/* Particle paths */}
          <path id="path-0" d={`M${NODE_CX[0]+R},${CY} L${NODE_CX[1]-R},${CY}`} />
          <path id="path-1" d={`M${NODE_CX[1]+R},${CY} L${NODE_CX[2]-R},${CY}`} />
          <path id="path-2" d={`M${NODE_CX[2]+R},${CY} L${NODE_CX[3]-R},${CY}`} />
          <path id="path-3" d={`M${NODE_CX[3]+R},${CY} L${NODE_CX[4]-R},${CY}`} />
          <path id="path-dlq" d={`M${NODE_CX[2]},${CY+R} L${NODE_CX[2]},175`} />
        </defs>

        {/* ── Pipe connectors ─────────────────────────────────────────── */}
        {NODE_CX.slice(0,-1).map((cx, i) => (
          <line key={i}
            x1={cx + R} y1={CY}
            x2={NODE_CX[i+1] - R} y2={CY}
            stroke="#243352" strokeWidth={2.5} strokeDasharray="5 4"
          />
        ))}

        {/* DLQ drop line */}
        <line
          x1={NODE_CX[2]} y1={CY + R}
          x2={NODE_CX[2]} y2={172}
          stroke="#EF444455" strokeWidth={2} strokeDasharray="4 3"
        />

        {/* ── Flow particles (CSS animateMotion — zero JS) ─────────────── */}
        {/* Producer → Pending */}
        {["0s", "-1.2s"].map((begin, i) => (
          <circle key={`p0-${i}`} r={3.5} fill="#8B5CF6" opacity={0.85}>
            <animateMotion dur="2.2s" repeatCount="indefinite" begin={begin}>
              <mpath href="#path-0" />
            </animateMotion>
          </circle>
        ))}
        {/* Pending → Claimed */}
        {["0s", "-1.0s"].map((begin, i) => (
          <circle key={`p1-${i}`} r={3.5} fill="#F5C518" opacity={0.85}>
            <animateMotion dur="1.9s" repeatCount="indefinite" begin={begin}>
              <mpath href="#path-1" />
            </animateMotion>
          </circle>
        ))}
        {/* Claimed → Completed */}
        {["0s", "-0.9s"].map((begin, i) => (
          <circle key={`p2-${i}`} r={3.5} fill="#10B981" opacity={0.85}>
            <animateMotion dur="1.7s" repeatCount="indefinite" begin={begin}>
              <mpath href="#path-2" />
            </animateMotion>
          </circle>
        ))}
        {/* Completed → Sink */}
        <circle r={3.5} fill="#06B6D4" opacity={0.85}>
          <animateMotion dur="2.0s" repeatCount="indefinite" begin="0s">
            <mpath href="#path-3" />
          </animateMotion>
        </circle>
        {/* Occasional fail particle to DLQ */}
        <circle r={3} fill="#EF4444" opacity={0.7}>
          <animateMotion dur="3s" repeatCount="indefinite" begin="-1s">
            <mpath href="#path-dlq" />
          </animateMotion>
        </circle>

        {/* ── Pipeline nodes ───────────────────────────────────────────── */}
        {NODES.map((node, i) => {
          const cx    = NODE_CX[i];
          const count = getCount(node.countKey);
          return (
            <g key={node.id}>
              {/* Pulse ring */}
              <circle cx={cx} cy={CY} r={R + 7}
                fill="none" stroke={node.color} strokeWidth={1} opacity={0.12}>
                <animate attributeName="r"
                  values={`${R+5};${R+11};${R+5}`}
                  dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity"
                  values="0.12;0.04;0.12"
                  dur="3s" repeatCount="indefinite" />
              </circle>
              {/* Node body */}
              <circle cx={cx} cy={CY} r={R}
                fill="#0D1220" stroke={node.color} strokeWidth={1.5} />
              {/* Label */}
              <text x={cx} y={CY - 7} textAnchor="middle"
                fill={node.color} fontSize={7}
                fontFamily="'JetBrains Mono', monospace" fontWeight="600"
                letterSpacing="0.8">
                {node.label}
              </text>
              {/* Count */}
              <text x={cx} y={CY + 11} textAnchor="middle"
                fill={node.color} fontSize={15}
                fontFamily="'JetBrains Mono', monospace" fontWeight="700">
                {count !== null ? count : "·"}
              </text>
            </g>
          );
        })}

        {/* ── DLQ box ──────────────────────────────────────────────────── */}
        <rect x={NODE_CX[2] - 38} y={174} width={76} height={30}
          rx={5} fill="#120505" stroke="#EF4444" strokeWidth={1.5}>
          <animate attributeName="stroke-opacity"
            values="1;0.3;1" dur="2s" repeatCount="indefinite" />
        </rect>
        <text x={NODE_CX[2]} y={185} textAnchor="middle"
          fill="#EF4444" fontSize={7}
          fontFamily="'JetBrains Mono', monospace" fontWeight="600">
          DEAD LETTER
        </text>
        <text x={NODE_CX[2]} y={199} textAnchor="middle"
          fill="#EF4444" fontSize={13}
          fontFamily="'JetBrains Mono', monospace" fontWeight="700">
          {metrics.dlq}
        </text>

        {/* ── Recovering badge ─────────────────────────────────────────── */}
        {metrics.recovering > 0 && (
          <g>
            <circle cx={NODE_CX[2] - 48} cy={CY - 42} r={16}
              fill="#F9731608" stroke="#F97316" strokeWidth={1.5}
              strokeDasharray="3 2">
              <animateTransform attributeName="transform" type="rotate"
                from={`0 ${NODE_CX[2]-48} ${CY-42}`}
                to={`360 ${NODE_CX[2]-48} ${CY-42}`}
                dur="4s" repeatCount="indefinite" />
            </circle>
            <text x={NODE_CX[2] - 48} y={CY - 38} textAnchor="middle"
              fill="#F97316" fontSize={11}
              fontFamily="'JetBrains Mono', monospace" fontWeight="700">
              {metrics.recovering}
            </text>
            <text x={NODE_CX[2] - 48} y={CY - 28} textAnchor="middle"
              fill="#F97316" fontSize={6}
              fontFamily="'JetBrains Mono', monospace">
              REC
            </text>
          </g>
        )}
      </svg>

      {/* ── Task dot grid ─────────────────────────────────────────────── */}
      {taskDots.length > 0 && (
        <div className="w-full px-2">
          <p className="text-[10px] font-mono text-text-muted mb-1.5 uppercase tracking-wider">
            Live Tasks · {taskDots.length} shown
          </p>
          <div className="flex flex-wrap gap-1.5">
            {taskDots.map((task) => (
              <div
                key={task.task_id}
                title={`${task.name} · ${task.status}`}
                className="w-2.5 h-2.5 rounded-full cursor-default transition-transform hover:scale-150"
                style={{ background: STATUS_COLORS[task.status] ?? "#475569" }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Legend ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-[10px] font-mono text-text-muted">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}