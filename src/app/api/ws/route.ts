import { NextRequest } from "next/server";
import { broker } from "@/lib/broker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const encoder  = new TextEncoder();
  let   isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (isClosed) return; // guard — never write to closed controller
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch (_) {
          isClosed = true;
        }
      };

      // Send initial snapshot
      try {
        const [metrics, tasks] = await Promise.all([
          broker.getMetrics(),
          broker.listTasks({ limit: 20 }),
        ]);
        send("metrics", { metrics, timestamp: new Date().toISOString() });
        send("tasks",   { tasks,   timestamp: new Date().toISOString() });
      } catch (_) {}

      // Poll every 3 seconds
      const interval = setInterval(async () => {
        if (isClosed) {
          clearInterval(interval);
          return;
        }
        try {
          const [metrics, tasks] = await Promise.all([
            broker.getMetrics(),
            broker.listTasks({ limit: 20 }),
          ]);
          send("metrics", { metrics, timestamp: new Date().toISOString() });
          send("tasks",   { tasks,   timestamp: new Date().toISOString() });
        } catch (_) {
          // DB error — don't close, just skip this tick
        }
      }, 3000);

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        isClosed = true;
        clearInterval(interval);
        try { controller.close(); } catch (_) {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}