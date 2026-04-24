// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Navbar
// ─────────────────────────────────────────────────────────────────────────────

"use client";

interface NavbarProps {
  connected:   boolean;
  lastUpdate:  Date | null;
  onEnqueue:   () => void;
  activeWorkers: number;
}

export default function Navbar({ connected, lastUpdate, onEnqueue, activeWorkers }: NavbarProps) {
  return (
    <header className="h-14 flex-shrink-0 border-b border-border-subtle bg-bg-secondary/80 backdrop-blur-sm flex items-center justify-between px-6 z-40 relative">
      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="relative w-7 h-7">
            <div className="absolute inset-0 rounded-lg border border-accent-yellow/40 rotate-12" />
            <div className="absolute inset-0.5 rounded-md bg-accent-yellow/10 flex items-center justify-center">
              <span className="text-accent-yellow text-[10px] font-mono font-bold">EOS</span>
            </div>
          </div>
          <div>
            <span className="font-display font-bold text-text-primary text-sm">EOS Queue</span>
            <span className="text-text-muted font-mono text-[10px] ml-2">v1.0</span>
          </div>
        </div>

        {/* Separator */}
        <div className="h-5 w-px bg-border-subtle hidden sm:block" />

        {/* Connection status */}
        <div className="hidden sm:flex items-center gap-2">
          <span className={`pulse-dot ${connected ? "pulse-dot-green" : "pulse-dot-red"}`} />
          <span className={`text-xs font-mono ${connected ? "text-accent-green" : "text-accent-red"}`}>
            {connected ? "LIVE" : "RECONNECTING"}
          </span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Active workers */}
        <div className="hidden md:flex items-center gap-2 bg-bg-surface border border-border-subtle rounded-lg px-3 py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-accent-cyan">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="text-xs font-mono text-text-secondary">
            <span className="text-accent-cyan font-bold">{activeWorkers}</span> workers
          </span>
        </div>

        {/* Last update */}
        {lastUpdate && (
          <span className="text-[11px] font-mono text-text-muted hidden lg:block">
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
        )}

        {/* Enqueue button */}
        <button
          onClick={onEnqueue}
          className="flex items-center gap-2 bg-accent-yellow text-bg-primary font-mono text-xs font-bold px-4 py-2 rounded-lg hover:bg-accent-amber transition-all active:scale-95"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          Enqueue Task
        </button>
      </div>
    </header>
  );
}