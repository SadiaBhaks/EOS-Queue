// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/dlq — Dead Letter Queue Entries
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { broker } from "@/lib/broker";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");

    const entries = await broker.listDLQ(limit);
    return NextResponse.json({ entries, count: entries.length });
  } catch (err) {
    console.error("[GET /api/dlq]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}