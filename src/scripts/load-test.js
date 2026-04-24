#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Load Test (Thundering Herd)
//  Phase 5.3: Simulate thousands of concurrent requests
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config({ path: ".env.local" });

const { v4: uuidv4 } = require("uuid");

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const CONFIG = {
  totalTasks:      parseInt(process.argv[2]) || 200,
  batchSize:       parseInt(process.argv[3]) || 20,   // concurrent requests per wave
  delayBetween:    parseInt(process.argv[4]) || 50,   // ms between waves
  idempotencyTest: true,  // also test duplicate rejection
};

async function enqueue(task) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    const latency = Date.now() - start;
    return { ok: res.status === 201, status: res.status, latency };
  } catch (err) {
    return { ok: false, status: 0, latency: Date.now() - start, error: err.message };
  }
}

async function runLoadTest() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  EOS Queue — Thundering Herd Load Test   ║");
  console.log(`║  Tasks: ${String(CONFIG.totalTasks).padEnd(33)}║`);
  console.log(`║  Batch: ${String(CONFIG.batchSize).padEnd(33)}║`);
  console.log("╚══════════════════════════════════════════╝\n");

  const results = { ok: 0, duplicate: 0, error: 0, latencies: [] };
  const taskIds = Array.from({ length: CONFIG.totalTasks }, () => uuidv4());

  const startTime = Date.now();

  // ── Phase 1: Thundering herd — all at once ──────────────────────────────────
  console.log("[Phase 1] Thundering herd — sending all tasks simultaneously...");

  let completed = 0;
  for (let i = 0; i < CONFIG.totalTasks; i += CONFIG.batchSize) {
    const batch = taskIds.slice(i, i + CONFIG.batchSize).map((id, j) => ({
      task_id:        id,
      name:           `load-test-task-${i + j}`,
      payload:        { batch: Math.floor(i / CONFIG.batchSize), index: j },
      priority_level: (Math.floor(Math.random() * 5) + 1),
      max_retries:    3,
    }));

    const batchResults = await Promise.all(batch.map(enqueue));

    for (const r of batchResults) {
      if (r.status === 201)   { results.ok++;        results.latencies.push(r.latency); }
      else if (r.status === 409) results.duplicate++;
      else                       results.error++;
    }

    completed += batch.length;
    process.stdout.write(`\r  Progress: ${completed}/${CONFIG.totalTasks} (${Math.round(completed/CONFIG.totalTasks*100)}%)`);

    if (CONFIG.delayBetween > 0) {
      await new Promise((r) => setTimeout(r, CONFIG.delayBetween));
    }
  }
  console.log();

  // ── Phase 2: Idempotency test — send duplicates ──────────────────────────────
  if (CONFIG.idempotencyTest) {
    console.log("\n[Phase 2] Idempotency test — sending 20 duplicate task IDs...");
    const duplicateSample = taskIds.slice(0, 20);
    const dupResults = await Promise.all(
      duplicateSample.map((id, i) =>
        enqueue({ task_id: id, name: `dup-${i}`, payload: {}, priority_level: 3, max_retries: 3 })
      )
    );
    const dupRejected = dupResults.filter((r) => r.status === 409).length;
    console.log(`  Duplicates correctly rejected: ${dupRejected}/20 ${dupRejected === 20 ? "✓" : "✗"}`);
  }

  const elapsed  = Date.now() - startTime;
  const sortedLat = results.latencies.sort((a, b) => a - b);
  const p50  = sortedLat[Math.floor(sortedLat.length * 0.50)] || 0;
  const p95  = sortedLat[Math.floor(sortedLat.length * 0.95)] || 0;
  const p99  = sortedLat[Math.floor(sortedLat.length * 0.99)] || 0;
  const avg  = sortedLat.length ? Math.round(sortedLat.reduce((a, b) => a + b, 0) / sortedLat.length) : 0;
  const rps  = Math.round((CONFIG.totalTasks / elapsed) * 1000);

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  LOAD TEST RESULTS                   ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║  Total time:     ${String(elapsed + "ms").padEnd(19)}║`);
  console.log(`║  Throughput:     ${String(rps + " req/s").padEnd(19)}║`);
  console.log("╠══════════════════════════════════════╣");
  console.log(`║  Enqueued:       ${String(results.ok).padEnd(19)}║`);
  console.log(`║  Duplicates:     ${String(results.duplicate).padEnd(19)}║`);
  console.log(`║  Errors:         ${String(results.error).padEnd(19)}║`);
  console.log("╠══════════════════════════════════════╣");
  console.log(`║  Latency P50:    ${String(p50 + "ms").padEnd(19)}║`);
  console.log(`║  Latency P95:    ${String(p95 + "ms").padEnd(19)}║`);
  console.log(`║  Latency P99:    ${String(p99 + "ms").padEnd(19)}║`);
  console.log(`║  Latency Avg:    ${String(avg + "ms").padEnd(19)}║`);
  console.log("╚══════════════════════════════════════╝");

  if (results.error === 0) {
    console.log("\n✅ PASSED — Zero errors under load");
  } else {
    console.log(`\n⚠  ${results.error} errors occurred — check server logs`);
  }
}

runLoadTest().catch(console.error);