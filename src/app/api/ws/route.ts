// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/ws — Server-Sent Events for Real-Time Dashboard Updates
//  Phase 4.1: Pushes task status changes to the frontend
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { broker } from "@/lib/broker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(msg));
      };

      // Send initial metrics immediately
      try {
        const [metrics, tasks, workers] = await Promise.all([
          broker.getMetrics(),
          broker.listTasks({ limit: 20 }),
          (async () => {
            const { WorkerModel } = await import("@/lib/db/models");
            const { connectDB }   = await import("@/lib/db/connections");
            await connectDB();
            return WorkerModel.find({ status: { $ne: "DEAD" } }).lean();
          })(),
        ]);

        send("metrics", { metrics, timestamp: new Date().toISOString() });
        send("tasks",   { tasks,   timestamp: new Date().toISOString() });
        send("workers", { workers, timestamp: new Date().toISOString() });
      } catch (_) {}

      // Poll every 2 seconds
      const interval = setInterval(async () => {
        try {
          const [metrics, tasks] = await Promise.all([
            broker.getMetrics(),
            broker.listTasks({ limit: 20 }),
          ]);
          send("metrics", { metrics, timestamp: new Date().toISOString() });
          send("tasks",   { tasks,   timestamp: new Date().toISOString() });
        } catch (_) {
          clearInterval(interval);
          controller.close();
        }
      }, 2000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      Connection:      "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}