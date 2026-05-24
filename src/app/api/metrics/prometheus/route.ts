// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Prometheus Metrics Endpoint
//  Exposes queue metrics in Prometheus text format
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { broker } from "@/lib/broker";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const m = await broker.getMetrics();

    // Prometheus text format
    const output = [
      `# HELP eos_tasks_pending Number of pending tasks`,
      `# TYPE eos_tasks_pending gauge`,
      `eos_tasks_pending ${m.pending}`,

      `# HELP eos_tasks_claimed Number of claimed (in-flight) tasks`,
      `# TYPE eos_tasks_claimed gauge`,
      `eos_tasks_claimed ${m.claimed}`,

      `# HELP eos_tasks_completed Total completed tasks`,
      `# TYPE eos_tasks_completed counter`,
      `eos_tasks_completed ${m.completed}`,

      `# HELP eos_tasks_failed Total failed tasks`,
      `# TYPE eos_tasks_failed gauge`,
      `eos_tasks_failed ${m.failed}`,

      `# HELP eos_tasks_recovering Tasks being recovered from zombie workers`,
      `# TYPE eos_tasks_recovering gauge`,
      `eos_tasks_recovering ${m.recovering}`,

      `# HELP eos_tasks_dlq Tasks in dead letter queue`,
      `# TYPE eos_tasks_dlq gauge`,
      `eos_tasks_dlq ${m.dlq}`,

      `# HELP eos_throughput_per_second Task throughput per second`,
      `# TYPE eos_throughput_per_second gauge`,
      `eos_throughput_per_second ${m.throughput}`,

      `# HELP eos_avg_latency_ms Average task processing latency in milliseconds`,
      `# TYPE eos_avg_latency_ms gauge`,
      `eos_avg_latency_ms ${m.avg_latency}`,

      `# HELP eos_active_workers Number of active workers`,
      `# TYPE eos_active_workers gauge`,
      `eos_active_workers ${m.active_workers}`,

      `# HELP eos_total_tasks Total tasks in the system`,
      `# TYPE eos_total_tasks gauge`,
      `eos_total_tasks ${m.total_tasks}`,
    ].join("\n");

    return new Response(output, {
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    });
  } catch (err) {
    console.error("[Prometheus] Error:", err);
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}