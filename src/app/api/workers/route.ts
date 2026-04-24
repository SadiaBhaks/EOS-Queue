// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/workers — Worker Registry
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import connectDB from "@/lib/db/connections";
import { WorkerModel } from "@/lib/db/models";

export async function GET() {
  try {
    await connectDB();
    const workers = await WorkerModel.find().sort({ last_seen: -1 }).limit(50).lean();
    return NextResponse.json({ workers });
  } catch (err) {
    console.error("[GET /api/workers]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}