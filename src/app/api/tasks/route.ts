// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/tasks — Producer Endpoint
//  Phase 2.1: Accepts tasks, enforces idempotency, returns task or 409
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { broker } from "@/lib/broker";

// Look up where your PriorityLevel type/enum is defined and import it. 
// If it's defined directly inside the broker or types file, use that path:
// e.g., import { PriorityLevel } from "@/types"; 

const CreateTaskSchema = z.object({
  task_id:         z.string().uuid().optional(),
  idempotency_key: z.string().min(1).max(256).optional(),
  name:            z.string().min(1).max(128),
  payload:         z.record(z.unknown()).default({}),
  priority_level:  z.number().int().min(1).max(5).default(3),
  max_retries:     z.number().int().min(0).max(10).default(5),
  visibility_timeout: z.number().int().min(5000).max(300000).default(30000),
});

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const parsed = CreateTaskSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    // FIX: Explicitly cast parsed.data to bypass the strict type mismatch,
    // since Zod already guarantees the number is an integer between 1 and 5.
    const task = await broker.enqueue(parsed.data as any); 
    // Note: If you imported `PriorityLevel`, you can use `parsed.data as unknown as { priority_level: PriorityLevel } & Omit<typeof parsed.data, 'priority_level'>` 
    // but `as any` is perfectly safe here since Zod has already validated the schema structurally.

    if (!task) {
      // Idempotency hit — duplicate task_id / idempotency_key
      return NextResponse.json(
        { error: "Duplicate task: idempotency_key already processed", code: "DUPLICATE" },
        { status: 409 }
      );
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/tasks]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status  = searchParams.get("status") || undefined;
    const limit   = parseInt(searchParams.get("limit")  || "50");
    const offset  = parseInt(searchParams.get("offset") || "0");

    const tasks = await broker.listTasks({ status, limit, offset });
    return NextResponse.json({ tasks, count: tasks.length });
  } catch (err) {
    console.error("[GET /api/tasks]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}