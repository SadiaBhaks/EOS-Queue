# EOS Queue
### Exactly-Once Semantics · Distributed Task Queue · Real-Time Dashboard

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-3ECF8E?style=for-the-badge&logo=supabase)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=for-the-badge&logo=tailwind-css)
![GSAP](https://img.shields.io/badge/GSAP-Animations-88CE02?style=for-the-badge&logo=greensock)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

**A production-grade distributed task queue with exactly-once processing guarantees,
a real-time animated dashboard, and resilience mechanisms engineered to never lose a task.**

[Live Demo](#) · [Architecture](#architecture) · [Quick Start](#quick-start) · [API Reference](#api-reference)

</div>

---

## What is EOS Queue?

EOS Queue is a **full-stack distributed task processing system** built from scratch — no off-the-shelf queue libraries like BullMQ or Celery. Every component — the broker, the atomic claim mechanism, the heartbeat monitor, the idempotency layer, and the dashboard — was engineered and implemented manually.

The system guarantees that **every task executes exactly once**, even under:
- Concurrent workers racing to claim the same task
- Workers crashing mid-execution (zombie recovery)
- Network partitions and database timeouts
- Duplicate submissions from producers
- Server restarts

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│   PRODUCER  ──►  PENDING  ──►  CLAIMED  ──►  COMPLETED          │
│      │               ▲            │                              │
│      │               │       (fail/zombie)                       │
│      │               │            ▼                              │
│      │           RECOVERING  ◄────────────►  FAILED  ──►  DLQ   │
│      │                                                           │
│   Idempotency Check                                              │
│   (blocks duplicates)                                            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### The Three-Lock EOS Mechanism

Exactly-Once Semantics is enforced through three interlocking layers:

| Lock | Implementation | Guarantee |
|------|---------------|-----------|
| **Claim Lock** | `SELECT FOR UPDATE SKIP LOCKED` | Only one worker claims each task |
| **Heartbeat Lock** | Periodic keepalive with visibility timeout | Zombie workers release tasks automatically |
| **Idempotency Lock** | `INSERT ... ON CONFLICT DO NOTHING` | Business logic executes at most once |

### Retry: Jittered Exponential Backoff

```
t_wait = min(base × 2ⁿ, maxDelay) + random_jitter

n=0: ~1s    n=1: ~2s    n=2: ~4s    n=3: ~8s    n=4: ~16s    n=5: → DLQ
```

Jitter prevents thundering-herd re-claim storms after mass failures.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 16 (App Router) | Full-stack, SSE streaming, API routes |
| **Database** | PostgreSQL via Supabase | `SELECT FOR UPDATE SKIP LOCKED` for atomic claims |
| **Animations** | GSAP 3 | Smooth metric card transitions, entrance animations |
| **Styling** | Tailwind CSS | Dark HUD aesthetic, responsive grid |
| **Real-time** | Server-Sent Events (SSE) | Push task updates to dashboard every 3s |
| **Email** | Resend API | Transactional email task handler |
| **Payments** | Stripe API | Payment processing task handler |
| **SMS** | Twilio | OTP delivery task handler |
| **Storage** | AWS S3 | File backup and image resize task handlers |
| **CI/CD** | GitHub Actions | Automated test, build, and deploy pipeline |
| **Containers** | Docker + Docker Compose | Prometheus + Grafana observability stack |

---

## Key Engineering Decisions

### Why PostgreSQL over Redis?

Most task queues use Redis for its speed, but this project deliberately uses PostgreSQL to demonstrate:

- **ACID transactions** — the claim, heartbeat, and idempotency writes are all transactional
- **`SELECT FOR UPDATE SKIP LOCKED`** — PostgreSQL's native solution to the double-claim race condition; semantically equivalent to Redis `SETNX` but with full relational guarantees
- **Persistent storage** — tasks survive server restarts without a separate persistence layer
- **Rich querying** — filter by status, priority, retry count using standard SQL

### Why Server-Sent Events over WebSockets?

SSE is unidirectional (server → client) which is exactly what a dashboard needs — the client never needs to push data to the server for display purposes. SSE requires no additional infrastructure (no socket.io server, no port management) and works natively through HTTP/2.

### Why no existing queue library?

Building from scratch demonstrates a deep understanding of the problems these libraries solve — atomic claiming, exactly-once semantics, visibility timeouts, dead letter queues. Using BullMQ or Celery would hide all of that complexity.

---

## Features

### Core Queue Engine
- ✅ **Atomic task claiming** — `SELECT FOR UPDATE SKIP LOCKED` prevents double-processing
- ✅ **Exactly-once semantics** — idempotency records persist results, block duplicate execution
- ✅ **Priority queue** — tasks sorted by priority (1–5) then FIFO within same priority
- ✅ **Jittered exponential backoff** — prevents thundering herd on retry storms
- ✅ **Zombie worker detection** — heartbeat monitor recovers tasks from dead workers
- ✅ **Dead Letter Queue** — tasks exceeding retry budget are preserved for inspection
- ✅ **Graceful shutdown** — workers drain in-flight tasks before exiting

### Real-Time Dashboard
- ✅ **Live HUD metrics** — Pending, Claimed, Completed, Failed, Recovering, Throughput, Latency, DLQ
- ✅ **GSAP animations** — number transitions on every metric update
- ✅ **SVG pipeline visualization** — animated task flow from Producer → Worker → Sink
- ✅ **Task feed** — filterable, searchable table with expandable payload view
- ✅ **Worker registry** — live worker status, task counts, last-seen timestamps
- ✅ **SSE real-time updates** — dashboard polls every 3 seconds via Server-Sent Events

### Production-Ready Integrations
- ✅ **Resend** — transactional email (replaces SendGrid, no phone verification required)
- ✅ **Stripe** — payment intent creation and fraud checks via Stripe Radar
- ✅ **Twilio** — SMS OTP delivery with email fallback
- ✅ **AWS S3** — file backup uploads and image resize storage
- ✅ **Graceful degradation** — all integrations fall back to simulation mode when credentials are absent

### Observability
- ✅ **Prometheus metrics endpoint** — `/api/metrics/prometheus` exposes queue metrics in text format
- ✅ **Grafana dashboard** — pre-configured via Docker Compose
- ✅ **Structured logging** — every worker action logged with task ID, duration, status

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL database (Supabase free tier recommended)

### 1. Clone and install

```bash
git clone https://github.com/SadiaBhaks/EOS-Queue.git
cd EOS-Queue
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```bash
# Required
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require

# Optional — workers simulate these if not provided
RESEND_API_KEY=re_xxxx
EMAIL_FROM=you@yourdomain.com
STRIPE_SECRET_KEY=sk_test_xxxx
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_PHONE_NUMBER=+1xxxx
AWS_ACCESS_KEY_ID=xxxx
AWS_SECRET_ACCESS_KEY=xxxx
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your-bucket
```

### 3. Initialize database

```bash
node src/scripts/migrate.js
```

### 4. Start the dashboard

```bash
npm run dev
# → http://localhost:3000
```

### 5. Start workers (new terminal)

```bash
node src/scripts/worker.js
```

### 6. Seed demo tasks (new terminal)

```bash
node src/scripts/seed.js
```

Watch tasks flow from **PENDING → CLAIMED → COMPLETED** in real time.

---

## Project Structure

```
eos-queue/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── tasks/route.ts          # POST (enqueue) + GET (list)
│   │   │   ├── workers/route.ts        # Worker registry
│   │   │   ├── metrics/route.ts        # Queue metrics snapshot
│   │   │   ├── metrics/prometheus/     # Prometheus text format endpoint
│   │   │   ├── dlq/route.ts            # Dead Letter Queue
│   │   │   └── ws/route.ts             # Server-Sent Events stream
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── components/
│   │   ├── 3d/
│   │   │   └── PipelineVisualization.tsx   # SVG animated pipeline
│   │   ├── dashboard/
│   │   │   ├── Dashboard.tsx               # Main layout orchestrator
│   │   │   ├── Navbar.tsx                  # Live status + enqueue button
│   │   │   ├── TaskTable.tsx               # Filterable task feed
│   │   │   ├── WorkersPanel.tsx            # Worker registry panel
│   │   │   └── DLQPanel.tsx                # Dead letter queue panel
│   │   └── ui/
│   │       ├── MetricCard.tsx              # GSAP-animated HUD tile
│   │       ├── StatusBadge.tsx             # Status pill component
│   │       ├── CreateTaskModal.tsx         # Producer form with templates
│   │       └── LoadingScreen.tsx
│   ├── hooks/
│   │   ├── useRealtimeData.ts              # SSE subscription hook
│   │   └── useTaskActions.ts               # Task creation hook
│   ├── lib/
│   │   ├── broker/
│   │   │   ├── index.ts                    # IBroker interface + factory
│   │   │   └── postgresql-broker.ts        # Full PostgreSQL implementation
│   │   └── db/
│   │       ├── connection.ts               # pg Pool singleton
│   │       └── models.ts                   # Schema migration (mutex-protected)
│   ├── types/index.ts                      # All TypeScript interfaces + calcBackoff
│   └── styles/globals.css
├── src/scripts/
│   ├── worker.js                           # Worker pool + real service integrations
│   ├── seed.js                             # Demo task seeder
│   ├── migrate.js                          # One-time schema migration
│   ├── chaos.js                            # Chaos engineering test
│   ├── load-test.js                        # Thundering herd load test
│   └── idempotency-test.js                 # Idempotency verification test
├── infra/
│   └── prometheus.yml                      # Prometheus scrape config
├── .github/workflows/ci.yml               # GitHub Actions CI/CD
├── docker-compose.yml                      # Prometheus + Grafana stack
├── Dockerfile                              # Next.js production build
└── Dockerfile.worker                       # Worker process container
```

---

## API Reference

### `POST /api/tasks` — Enqueue a Task

```json
{
  "task_id":         "uuid-v4",
  "idempotency_key": "payment-txn-001",
  "name":            "process-payment",
  "payload":         { "amount": 9900, "currency": "usd", "customer_id": "cus_abc" },
  "priority_level":  5,
  "max_retries":     5,
  "visibility_timeout": 60000
}
```

| Response | Meaning |
|----------|---------|
| `201 Created` | Task enqueued successfully |
| `409 Conflict` | Duplicate `idempotency_key` — task already processed |
| `422 Unprocessable` | Validation error |

### `GET /api/tasks` — List Tasks

```
GET /api/tasks?status=PENDING&limit=50&offset=0
```

### `GET /api/metrics` — Queue Metrics

```json
{
  "metrics": {
    "pending": 12,
    "claimed": 3,
    "completed": 847,
    "failed": 2,
    "recovering": 0,
    "dlq": 1,
    "throughput": 0.47,
    "avg_latency": 1234,
    "active_workers": 2,
    "total_tasks": 865
  }
}
```

### `GET /api/metrics/prometheus` — Prometheus Format

```
# HELP eos_tasks_pending Number of pending tasks
# TYPE eos_tasks_pending gauge
eos_tasks_pending 12
# HELP eos_tasks_completed Total completed tasks
# TYPE eos_tasks_completed counter
eos_tasks_completed 847
```

### `GET /api/ws` — Server-Sent Events

Real-time stream pushing `metrics` and `tasks` events every 3 seconds.

### `GET /api/workers` — Worker Registry

### `GET /api/dlq` — Dead Letter Queue Entries

---

## Testing

```bash
# Unit tests — retry math, state machine, priority ordering
npm test

# Idempotency verification — sends 10 concurrent duplicate tasks, verifies exactly 1 accepted
node src/scripts/idempotency-test.js

# Chaos test — kills worker heartbeats mid-task, verifies zombie recovery
node src/scripts/chaos.js

# Load test — thundering herd with P50/P95/P99 latency report
node src/scripts/load-test.js 200 20

# Custom load
node src/scripts/load-test.js <tasks> <batch_size> <delay_ms>
```

---

## Resilience Specification

| Failure Scenario | Detection | Recovery |
|-----------------|-----------|----------|
| Worker crash mid-task | `last_heartbeat` expires after `visibility_timeout` | Heartbeat monitor re-queues with RECOVERING status |
| Network partition | Heartbeat stops; same as crash | Same — re-queued with backoff delay |
| Duplicate task submission | `idempotency_key` unique constraint | Returns 409; original task proceeds unaffected |
| Thundering herd | Jitter on all retry delays | Spreads re-claim load across time |
| Retry budget exhausted | `retry_count > max_retries` | Task moved to Dead Letter Queue |
| Race condition on claim | Atomic `SELECT FOR UPDATE SKIP LOCKED` | Only one winner per task; all others skip |
| Schema init deadlock | Shared mutex promise across callers | Single SQL execution regardless of concurrency |
| Supabase pause | Connection error on startup | Re-connects automatically; schema re-initializes |

---

## Observability

### Prometheus + Grafana (Docker)

```bash
docker compose up prometheus grafana -d

# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3001  (admin / eos_admin)
```

In Grafana, add Prometheus as a data source (`http://prometheus:9090`) and query:

```promql
eos_tasks_completed          # Total completions
eos_throughput_per_second    # Tasks/sec over last 60s
eos_avg_latency_ms           # Average processing time
eos_active_workers           # Live worker count
```

---

## What I Learned Building This

This project required solving real distributed systems problems:

- **The double-claim problem** — how to ensure two workers can't process the same task simultaneously without a central lock manager. Solution: PostgreSQL's `SKIP LOCKED` which was specifically designed for queue semantics.

- **The exactly-once problem** — how to guarantee business logic (charging a card, sending an email) only runs once even if the network fails between processing and acknowledgment. Solution: write the idempotency record *before* marking the task complete. If the process dies between those two writes, the next worker finds the idempotency record and skips re-execution.

- **The zombie problem** — what happens when a worker claims a task and then dies? No explicit failure signal is sent. Solution: heartbeat timestamps with visibility timeouts. If a worker hasn't sent a heartbeat recently, a background monitor assumes it's dead and reclaims the task.

- **The startup deadlock** — multiple API routes calling `initSchema()` simultaneously on first boot caused PostgreSQL deadlocks on `CREATE TABLE`. Solution: a shared promise mutex so only one call actually executes the SQL.

---

## Author

**Sadia** — Computer Science & Engineering, Final Year  
Building production-grade systems and ML applications.

[![GitHub](https://img.shields.io/badge/GitHub-SadiaBhaks-181717?style=flat&logo=github)](https://github.com/SadiaBhaks/EOS-Queue)

---

## License

MIT — feel free to use, fork, and build on this.
