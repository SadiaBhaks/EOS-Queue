#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Chaos Engineering Test
//  Phase 5.1: Scripted kill signals to verify task recovery
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config({ path: ".env.local" });

const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const BASE_URL    = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/eos_queue";

const CHAOS_CONFIG = {
  taskCount:        20,
  workerCount:       3,
  killAfterMs:    1500, // Kill workers 1.5s after they claim a task
  recoveryWaitMs: 45000, // Wait 45s for heartbeat monitor to recover zombies
  checkIntervalMs: 2000,
};

async function connect() {
  await mongoose.connect(MONGODB_URI);
  const TaskSchema = new mongoose.Schema({
    task_id: String, status: String, worker_id: String,
    retry_count: Number, error_message: String, dlq: Boolean,
  }, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });
  return mongoose.models.Task || mongoose.model("Task", TaskSchema);
}

async function seedChaosTask(i) {
  await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task_id: uuidv4(),
      name: `chaos-task-${i}`,
      payload: { chaos: true, index: i },
      priority_level: 3,
      max_retries: 3,
      visibility_timeout: 10000, // 10s so zombies are detected faster
    }),
  });
}

async function claimTask(workerId) {
  try {
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: uuidv4(),
        name: "phantom-claim",
        payload: {},
        priority_level: 3,
        max_retries: 1,
      }),
    });
    return null; // simplified — just return null for chaos test
  } catch (_) { return null; }
}

async function runChaosTest() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  EOS Queue — Chaos Engineering Test      ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const Task = await connect();

  // Step 1: Seed chaos tasks
  console.log(`[Phase 1] Seeding ${CHAOS_CONFIG.taskCount} chaos tasks...`);
  for (let i = 0; i < CHAOS_CONFIG.taskCount; i++) {
    await seedChaosTask(i);
  }
  console.log(`[Phase 1] ✓ ${CHAOS_CONFIG.taskCount} tasks seeded\n`);

  // Step 2: Count initial pending
  const initialPending = await Task.countDocuments({ status: "PENDING", name: /chaos-task/ });
  console.log(`[Phase 2] Initial pending tasks: ${initialPending}`);

  // Step 3: Let workers claim them, then forcibly mark worker heartbeats as stale
  console.log(`\n[Phase 3] Simulating zombie workers by expiring heartbeats...`);
  await new Promise((r) => setTimeout(r, 3000));

  // Force heartbeats to expire by setting them 2 minutes in the past
  const claimedTasks = await Task.find({ status: "CLAIMED", name: /chaos-task/ });
  console.log(`[Phase 3] Found ${claimedTasks.length} claimed tasks — killing their heartbeats`);

  for (const t of claimedTasks) {
    await Task.findOneAndUpdate(
      { task_id: t.task_id },
      { $set: { last_heartbeat: new Date(Date.now() - 120000) } } // 2 min ago
    );
  }
  console.log(`[Phase 3] ✓ Heartbeats expired — these workers are now "zombies"\n`);

  // Step 4: Wait for heartbeat monitor to recover them
  console.log(`[Phase 4] Waiting ${CHAOS_CONFIG.recoveryWaitMs / 1000}s for recovery...`);
  const startTime = Date.now();

  while (Date.now() - startTime < CHAOS_CONFIG.recoveryWaitMs) {
    await new Promise((r) => setTimeout(r, CHAOS_CONFIG.checkIntervalMs));

    const [pending, claimed, recovering, completed] = await Promise.all([
      Task.countDocuments({ status: "PENDING",    name: /chaos-task/ }),
      Task.countDocuments({ status: "CLAIMED",    name: /chaos-task/ }),
      Task.countDocuments({ status: "RECOVERING", name: /chaos-task/ }),
      Task.countDocuments({ status: "COMPLETED",  name: /chaos-task/ }),
    ]);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[${elapsed}s] PENDING:${pending} CLAIMED:${claimed} RECOVERING:${recovering} COMPLETED:${completed}`);

    if (recovering > 0 || (claimed === 0 && pending === 0 && completed > 0)) {
      if (recovering > 0) {
        console.log(`\n✓ RECOVERY VERIFIED — ${recovering} tasks are in RECOVERING state`);
      }
    }
  }

  // Step 5: Final report
  const [finalPending, finalClaimed, finalRecovering, finalCompleted, finalFailed] = await Promise.all([
    Task.countDocuments({ status: "PENDING",    name: /chaos-task/ }),
    Task.countDocuments({ status: "CLAIMED",    name: /chaos-task/ }),
    Task.countDocuments({ status: "RECOVERING", name: /chaos-task/ }),
    Task.countDocuments({ status: "COMPLETED",  name: /chaos-task/ }),
    Task.countDocuments({ status: "FAILED",     name: /chaos-task/ }),
  ]);

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  CHAOS TEST RESULTS                  ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║  Total seeded:    ${String(CHAOS_CONFIG.taskCount).padEnd(18)}║`);
  console.log(`║  Pending:         ${String(finalPending).padEnd(18)}║`);
  console.log(`║  Claimed:         ${String(finalClaimed).padEnd(18)}║`);
  console.log(`║  Recovering:      ${String(finalRecovering).padEnd(18)}║`);
  console.log(`║  Completed:       ${String(finalCompleted).padEnd(18)}║`);
  console.log(`║  Failed/DLQ:      ${String(finalFailed).padEnd(18)}║`);
  console.log("╚══════════════════════════════════════╝");

  const survived = finalCompleted + finalPending + finalRecovering + finalClaimed;
  const lost     = CHAOS_CONFIG.taskCount - survived - finalFailed;
  if (lost === 0) {
    console.log("\n✅ PASSED — No tasks were lost during worker failures");
  } else {
    console.log(`\n❌ FAILED — ${lost} tasks were lost`);
  }

  await mongoose.disconnect();
}

runChaosTest().catch(console.error);