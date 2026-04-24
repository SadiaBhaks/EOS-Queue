// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Root Layout
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title:       "EOS Queue — Exactly-Once Task Orchestration",
  description: "Production-grade distributed task queue with exactly-once semantics",
  keywords:    ["task queue", "distributed systems", "exactly-once", "EOS"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-bg-primary text-text-primary font-body antialiased">
        {children}
      </body>
    </html>
  );
}