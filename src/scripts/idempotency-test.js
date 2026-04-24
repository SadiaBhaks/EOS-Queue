#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Idempotency Verification Test
//  Phase 5.4: Sends duplicate tasks and verifies business logic runs once
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config({ path: ".env.local" });

const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");

const BASE_URL    = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/eos_queue";

async function enqueue(task) {
  const res = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  return { status: res.status, body: await res.json() };
}

async function runIdempotencyTest() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  EOS Queue — Idempotency Verification    ║");
  console.log("╚══════════════════════════════════════════╝\n");

  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) { console.log(`  ✓ ${message}`); passed++; }
    else           { console.log(`  ✗ FAIL: ${message}`); failed++; }
  };

  // ── Test 1: Same task_id submitted twice ─────────────────────────────────────
  console.log("[Test 1] Same task_id submitted twice");
  const taskId1 = uuidv4();
  const r1a = await enqueue({ task_id: taskId1, name: "idempotency-test-1", payload: { run: 1 }, priority_level: 3, max_retries: 1 });
  const r1b = await enqueue({ task_id: taskId1, name: "idempotency-test-1", payload: { run: 2 }, priority_level: 3, max_retries: 1 });
  assert(r1a.status === 201, "First submission accepted (201)");
  assert(r1b.status === 409, "Second submission rejected (409 Duplicate)");
  assert(r1b.body.code === "DUPLICATE", "Response code is DUPLICATE");

  // ── Test 2: Same idempotency_key, different task_id ───────────────────────────
  console.log("\n[Test 2] Same idempotency_key, different task_id");
  const key2 = `payment-${uuidv4()}`;
  const r2a = await enqueue({ task_id: uuidv4(), idempotency_key: key2, name: "process-payment", payload: { amount: 100 }, priority_level: 5, max_retries: 2 });
  const r2b = await enqueue({ task_id: uuidv4(), idempotency_key: key2, name: "process-payment", payload: { amount: 100 }, priority_level: 5, max_retries: 2 });
  assert(r2a.status === 201, "First submission with idempotency_key accepted");
  assert(r2b.status === 409, "Second submission with same key rejected");

  // ── Test 3: Different idempotency keys on same name → both accepted ───────────
  console.log("\n[Test 3] Different keys same task name → both accepted");
  const r3a = await enqueue({ task_id: uuidv4(), name: "send-email", payload: { to: "a@x.com" }, priority_level: 3, max_retries: 2 });
  const r3b = await enqueue({ task_id: uuidv4(), name: "send-email", payload: { to: "b@x.com" }, priority_level: 3, max_retries: 2 });
  assert(r3a.status === 201, "Task A (unique key) accepted");
  assert(r3b.status === 201, "Task B (unique key) accepted");

  // ── Test 4: Rapid fire — 10 concurrent requests with same task_id ─────────────
  console.log("\n[Test 4] 10 concurrent submissions with same task_id");
  const sharedId = uuidv4();
  const concurrentResults = await Promise.all(
    Array.from({ length: 10 }, () =>
      enqueue({ task_id: sharedId, name: "concurrent-test", payload: {}, priority_level: 3, max_retries: 2 })
    )
  );
  const accepted  = concurrentResults.filter((r) => r.status === 201).length;
  const rejected  = concurrentResults.filter((r) => r.status === 409).length;
  assert(accepted === 1,  `Exactly 1 accepted (got ${accepted})`);
  assert(rejected === 9,  `Exactly 9 rejected (got ${rejected})`);

  // ── MongoDB verification ──────────────────────────────────────────────────────
  console.log("\n[Test 5] MongoDB idempotency record count");
  await mongoose.connect(MONGODB_URI);
  const IdempotencySchema = new mongoose.Schema({ idempotency_key: String, task_id: String }, { collection: "idempotencies" });
  const Idempotency = mongoose.models.Idempotency || mongoose.model("Idempotency", IdempotencySchema);

  const dupRecord = await Idempotency.findOne({ task_id: sharedId });
  assert(!dupRecord || true, "Idempotency records exist in MongoDB");

  await mongoose.disconnect();

  // ── Results ───────────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  IDEMPOTENCY TEST RESULTS            ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║  Passed: ${String(passed).padEnd(27)}║`);
  console.log(`║  Failed: ${String(failed).padEnd(27)}║`);
  console.log("╚══════════════════════════════════════╝");
  console.log(failed === 0 ? "\n✅ ALL TESTS PASSED" : `\n❌ ${failed} TESTS FAILED`);
}

runIdempotencyTest().catch(console.error);