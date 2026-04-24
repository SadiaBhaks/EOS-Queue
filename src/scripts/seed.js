#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — Seed Script
//  Populates the queue with realistic demo tasks
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config({ path: ".env.local" });

const { v4: uuidv4 } = require("uuid");

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const TASK_TEMPLATES = [
  { name: "send-welcome-email",    priority: 4, payload: { to: "alice@example.com",  template: "welcome",     user_id: "u_001" } },
  { name: "send-welcome-email",    priority: 4, payload: { to: "bob@example.com",    template: "welcome",     user_id: "u_002" } },
  { name: "process-payment",       priority: 5, payload: { amount: 4999, currency: "USD", customer_id: "cus_abc" } },
  { name: "process-payment",       priority: 5, payload: { amount: 9900, currency: "EUR", customer_id: "cus_xyz" } },
  { name: "resize-image",          priority: 2, payload: { image_url: "https://cdn.example.com/photo.jpg", sizes: [128, 512] } },
  { name: "generate-invoice",      priority: 3, payload: { order_id: "ORD-001", format: "pdf" } },
  { name: "sync-inventory",        priority: 3, payload: { warehouse: "WH-EU-01", sku_list: ["SKU-A", "SKU-B"] } },
  { name: "send-push-notification",priority: 4, payload: { user_id: "u_003", message: "Your order shipped!" } },
  { name: "transcode-video",       priority: 2, payload: { video_id: "vid_001", formats: ["720p", "1080p"] } },
  { name: "update-search-index",   priority: 1, payload: { entity: "product", ids: ["p_101", "p_102", "p_103"] } },
  { name: "calculate-analytics",   priority: 2, payload: { report: "daily", date: "2025-06-01" } },
  { name: "send-weekly-digest",    priority: 3, payload: { segment: "active_users", count: 1240 } },
  { name: "backup-user-data",      priority: 1, payload: { user_id: "u_004", format: "json" } },
  { name: "run-fraud-check",       priority: 5, payload: { transaction_id: "txn_001", amount: 15000 } },
  { name: "send-otp",              priority: 5, payload: { phone: "+1-555-0100", code: "483921" } },
];

async function enqueueTask(template) {
  const task_id = uuidv4();
  try {
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        task_id,
        name:           template.name,
        payload:        template.payload,
        priority_level: template.priority,
        max_retries:    Math.floor(Math.random() * 4) + 2,
      }),
    });

    if (res.ok) {
      const { task } = await res.json();
      console.log(`✓ Enqueued [P${template.priority}]: ${template.name} → ${task.task_id.slice(0, 8)}`);
    } else if (res.status === 409) {
      console.log(`→ Skipped (duplicate): ${template.name}`);
    } else {
      const err = await res.json();
      console.error(`✗ Failed: ${template.name} — ${err.error}`);
    }
  } catch (err) {
    console.error(`✗ Network error for ${template.name}:`, err.message);
  }
}

async function main() {
  const count = parseInt(process.argv[2]) || TASK_TEMPLATES.length;

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  EOS Queue Seeder                        ║`);
  console.log(`║  Target: ${BASE_URL.padEnd(32)}║`);
  console.log(`║  Tasks:  ${String(count).padEnd(32)}║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  const tasks = Array.from({ length: count }, (_, i) => TASK_TEMPLATES[i % TASK_TEMPLATES.length]);
  for (const t of tasks) {
    await enqueueTask(t);
    await new Promise((r) => setTimeout(r, 80)); // gentle rate
  }

  console.log(`\n✓ Seeding complete — ${count} tasks enqueued`);
}

main().catch(console.error);