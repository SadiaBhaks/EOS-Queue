import { NextResponse } from "next/server";
import { pool } from "@/lib/db/connections";
import { initSchema } from "@/lib/db/models";

export async function GET() {
  try {
    await initSchema();
    const result = await pool.query(
      `SELECT * FROM workers ORDER BY last_seen DESC LIMIT 50`
    );
    return NextResponse.json({ workers: result.rows });
  } catch (err) {
    console.error("[GET /api/workers]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}