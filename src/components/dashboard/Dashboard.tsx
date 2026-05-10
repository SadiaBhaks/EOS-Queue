"use client";

import { useState, useEffect, useRef } from "react";
import { gsap } from "gsap";
import Navbar          from "./Navbar";
import TaskTable       from "./TaskTable";
import WorkersPanel    from "./WorkersPanel";
import DLQPanel        from "./DLQPanel";
import MetricCard      from "@/components/ui/MetricCard";
import CreateTaskModal from "@/components/ui/CreateTaskModal";
import { useRealtimeData } from "@/hooks/useRealtimeData";
import PipelineVisualization from "@/components/3d/PipelineVisualization";

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icons = {
  pending:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  claimed:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  completed: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  failed:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  throughput:<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 12h4l3-7 4 14 3-7h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  latency:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  workers:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  dlq:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
};

export default function Dashboard() {
  const { metrics, tasks, connected, lastUpdate, refresh } = useRealtimeData();
  const [modalOpen, setModalOpen] = useState(false);
  const [show3D,    setShow3D]    = useState(false); // ← OFF by default, saves resources
  const containerRef              = useRef<HTMLDivElement>(null);

  // Entrance animation — runs once on mount only
  useEffect(() => {
    if (!containerRef.current) return;
    const elements = containerRef.current.querySelectorAll(".animate-in");
    gsap.fromTo(
      elements,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power2.out", delay: 0.1 }
    );
  }, []); // empty deps — intentional, runs once

  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden" ref={containerRef}>

      {/* Background grid — pointer-events-none so it never blocks clicks */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(245,197,24,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(245,197,24,0.015) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Radial glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(245,197,24,0.05), transparent)" }}
      />

      {/* Navbar */}
      <div className="animate-in relative z-10">
        <Navbar
          connected={connected}
          lastUpdate={lastUpdate}
          onEnqueue={() => setModalOpen(true)}
          activeWorkers={metrics?.active_workers ?? 0}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col relative z-10">

        {/* ── Metrics HUD ────────────────────────────────────────────── */}
        <div className="animate-in grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 px-6 pt-5 flex-shrink-0">
          <MetricCard label="Pending"     value={metrics?.pending    ?? 0} color="yellow" icon={Icons.pending} />
          <MetricCard label="Claimed"     value={metrics?.claimed    ?? 0} color="cyan"   icon={Icons.claimed}   sublabel="In-flight" />
          <MetricCard label="Completed"   value={metrics?.completed  ?? 0} color="green"  icon={Icons.completed} />
          <MetricCard label="Failed"      value={metrics?.failed     ?? 0} color="red"    icon={Icons.failed} />
          <MetricCard label="Recovering"  value={metrics?.recovering ?? 0} color="orange" sublabel="Zombie rescued" />
          <MetricCard label="Throughput"  value={(metrics?.throughput ?? 0).toFixed(2)} unit="/s" color="cyan" icon={Icons.throughput} />
          <MetricCard label="Avg Latency" value={formatLatency(metrics?.avg_latency ?? 0)} color="purple" icon={Icons.latency} />
          <MetricCard label="DLQ"         value={metrics?.dlq        ?? 0} color="red"    icon={Icons.dlq} sublabel="Dead letter" />
        </div>

        {/* ── Middle section ──────────────────────────────────────────── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 px-6 pt-4 pb-4 min-h-0">

          {/* Left column — Pipeline + Task Table */}
          <div className="animate-in lg:col-span-8 flex flex-col gap-3 min-h-0">

            {/* Pipeline header */}
            <div className="flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="font-display font-semibold text-text-primary text-sm">
                  Pipeline Visualization
                </h2>
                <span className="text-[10px] font-mono text-text-muted border border-border-subtle px-2 py-0.5 rounded-full">
                  {show3D ? "SVG · LIVE" : "TABLE · LIVE"}
                </span>
              </div>
              <button
                onClick={() => setShow3D((v) => !v)}
                className="text-xs font-mono text-text-muted hover:text-accent-yellow transition-colors px-2 py-1 rounded border border-transparent hover:border-border-subtle"
              >
                {show3D ? "Hide Pipeline" : "Show Pipeline"}
              </button>
            </div>

            {/* Pipeline panel — only mounted when show3D is true */}
            {show3D && (
              <div
                className="flex-shrink-0 card overflow-hidden rounded-xl"
                style={{
                  height: "240px",
                  background: "linear-gradient(135deg, #080B14 0%, #0D1220 100%)",
                }}
              >
                <div className="scan-line" />
                {/* No Suspense needed — SVG component is synchronous */}
                <PipelineVisualization metrics={metrics!} tasks={tasks} />
              </div>
            )}

            {/* Task table — always visible, fills remaining space */}
            <div className="flex-1 min-h-0">
              <TaskTable tasks={tasks} />
            </div>
          </div>

          {/* Right sidebar */}
          <div className="animate-in lg:col-span-4 flex flex-col gap-4 min-h-0">
            <div className="flex-1 min-h-0">
              <WorkersPanel />
            </div>
            <div className="flex-1 min-h-0">
              <DLQPanel />
            </div>
          </div>
        </div>
      </div>

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={refresh}
      />

      {/* Scan line overlay */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="scan-line opacity-30" />
      </div>
    </div>
  );
}