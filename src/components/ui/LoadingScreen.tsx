// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Loading Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-bg-primary flex items-center justify-center z-50">
      <div className="text-center space-y-6">
        {/* Animated logo */}
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-accent-yellow/20 animate-spin-slow" />
          <div className="absolute inset-2 rounded-full border border-accent-yellow/40 animate-spin" style={{ animationDirection: "reverse", animationDuration: "3s" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-accent-yellow font-display font-bold text-xl">EOS</span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-text-primary font-display font-semibold text-lg">
            Initializing Queue Engine
          </p>
          <p className="text-text-muted text-sm font-mono">
            Connecting to MongoDB...
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-48 mx-auto h-0.5 bg-bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-yellow rounded-full"
            style={{
              animation: "progress 2s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes progress {
          0%   { width: 0%;   margin-left: 0%; }
          50%  { width: 60%;  margin-left: 20%; }
          100% { width: 0%;   margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}