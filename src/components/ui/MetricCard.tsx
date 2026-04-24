// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — MetricCard Component
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

interface MetricCardProps {
  label:    string;
  value:    number | string;
  unit?:    string;
  color?:   "yellow" | "cyan" | "green" | "red" | "orange" | "purple";
  icon?:    React.ReactNode;
  trend?:   "up" | "down" | "neutral";
  sublabel?: string;
}

const COLOR_MAP = {
  yellow: { text: "text-accent-yellow", border: "border-accent-yellow/20", bg: "bg-accent-yellow/5",  glow: "shadow-glow-yellow" },
  cyan:   { text: "text-accent-cyan",   border: "border-accent-cyan/20",   bg: "bg-accent-cyan/5",    glow: "shadow-glow-cyan"   },
  green:  { text: "text-accent-green",  border: "border-accent-green/20",  bg: "bg-accent-green/5",   glow: "shadow-glow-green"  },
  red:    { text: "text-accent-red",    border: "border-accent-red/20",    bg: "bg-accent-red/5",     glow: "shadow-glow-red"    },
  orange: { text: "text-accent-orange", border: "border-accent-orange/20", bg: "bg-accent-orange/5",  glow: "" },
  purple: { text: "text-accent-purple", border: "border-accent-purple/20", bg: "bg-accent-purple/5",  glow: "" },
};

export default function MetricCard({
  label, value, unit, color = "yellow", icon, sublabel,
}: MetricCardProps) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const prevVal  = useRef<number | string>(value);
  const colors   = COLOR_MAP[color];

  useEffect(() => {
    if (valueRef.current && prevVal.current !== value) {
      gsap.fromTo(
        valueRef.current,
        { scale: 1.15, opacity: 0.7 },
        { scale: 1,    opacity: 1,   duration: 0.3, ease: "back.out(2)" }
      );
      prevVal.current = value;
    }
  }, [value]);

  return (
    <div className={`card hud-border relative overflow-hidden p-4 ${colors.bg} transition-all duration-300`}>
      {/* Corner accent */}
      <div className={`absolute top-0 right-0 w-12 h-12 opacity-20`}
           style={{ background: `radial-gradient(circle at top right, currentColor, transparent)` }} />

      <div className="flex items-start justify-between mb-3">
        <span className="text-text-secondary text-xs font-mono uppercase tracking-widest">
          {label}
        </span>
        {icon && (
          <span className={`${colors.text} opacity-60`}>{icon}</span>
        )}
      </div>

      <div className="flex items-end gap-1.5">
        <span
          ref={valueRef}
          className={`metric-number text-3xl font-bold ${colors.text} leading-none`}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {unit && (
          <span className="text-text-muted text-sm font-mono mb-0.5">{unit}</span>
        )}
      </div>

      {sublabel && (
        <p className="text-text-muted text-xs mt-2 font-mono">{sublabel}</p>
      )}

      {/* Bottom accent line */}
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${colors.bg.replace("/5", "/30")}`} />
    </div>
  );
}