"use client";

export default function LoadingScreen() {
  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "#080B14",
    }}>
      <div style={{ textAlign: "center" }}>

        {/* Logo rings */}
        <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 24px" }}>
          <div style={{
            position: "absolute", inset: 0,
            borderRadius: "50%",
            border: "2px solid rgba(245,197,24,0.2)",
            animation: "spin 8s linear infinite",
          }} />
          <div style={{
            position: "absolute", inset: 6,
            borderRadius: "50%",
            border: "1px solid rgba(245,197,24,0.4)",
            animation: "spin 3s linear infinite reverse",
          }} />
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#F5C518", fontWeight: 700, fontSize: 14,
          }}>
            EOS
          </div>
        </div>

        <p style={{ color: "#F1F5F9", fontWeight: 600, marginBottom: 8 }}>
          Initializing Queue Engine
        </p>
        <p style={{ color: "#475569", fontSize: 13 }}>
          Connecting to MongoDB...
        </p>

        {/* Pulsing dots instead of animated bar — no keyframes needed */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 20 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 6, height: 6,
              borderRadius: "50%",
              backgroundColor: "#F5C518",
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>

      </div>
    </div>
  );
}