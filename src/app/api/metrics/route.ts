// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/metrics — Queue Metrics Snapshot
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { broker } from "@/lib/broker";

export async function GET() {
  try {
    const metrics = await broker.getMetrics();
    return NextResponse.json({ metrics, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[GET /api/metrics]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}