import { pool } from "./connections";

let initPromise: Promise<void> | null = null;

export function initSchema(): Promise<void> {
  if (initPromise) return initPromise;

  const p: Promise<void> = pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id                 SERIAL PRIMARY KEY,
      task_id            UUID        NOT NULL UNIQUE,
      idempotency_key    TEXT        NOT NULL UNIQUE,
      name               TEXT        NOT NULL,
      payload            JSONB       NOT NULL DEFAULT '{}',
      status             TEXT        NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','CLAIMED','COMPLETED','FAILED','RECOVERING')),
      priority_level     INTEGER     NOT NULL DEFAULT 3 CHECK (priority_level BETWEEN 1 AND 5),
      retry_count        INTEGER     NOT NULL DEFAULT 0,
      max_retries        INTEGER     NOT NULL DEFAULT 5,
      worker_id          TEXT,
      claimed_at         TIMESTAMPTZ,
      visibility_timeout INTEGER     NOT NULL DEFAULT 60000,
      last_heartbeat     TIMESTAMPTZ,
      completed_at       TIMESTAMPTZ,
      failed_at          TIMESTAMPTZ,
      next_retry_at      TIMESTAMPTZ,
      error_message      TEXT,
      dlq                BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS idempotency_records (
      id               SERIAL PRIMARY KEY,
      idempotency_key  TEXT        NOT NULL UNIQUE,
      task_id          UUID        NOT NULL,
      result           JSONB,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at       TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dlq_entries (
      id            SERIAL PRIMARY KEY,
      task_id       UUID        NOT NULL,
      original_task JSONB       NOT NULL,
      reason        TEXT        NOT NULL,
      moved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workers (
      id           SERIAL PRIMARY KEY,
      worker_id    TEXT        NOT NULL UNIQUE,
      status       TEXT        NOT NULL DEFAULT 'IDLE'
                   CHECK (status IN ('IDLE','BUSY','DEAD')),
      current_task UUID,
      started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      tasks_done   INTEGER     NOT NULL DEFAULT 0,
      tasks_failed INTEGER     NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_claim
      ON tasks (status, priority_level DESC, next_retry_at ASC)
      WHERE dlq = FALSE;
    CREATE INDEX IF NOT EXISTS idx_tasks_heartbeat
      ON tasks (status, last_heartbeat)
      WHERE status = 'CLAIMED';
    CREATE INDEX IF NOT EXISTS idx_idempotency_key
      ON idempotency_records (idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_dlq_task_id
      ON dlq_entries (task_id);
    CREATE INDEX IF NOT EXISTS idx_workers_status
      ON workers (status);
  `).then(() => {
    console.log("[DB] PostgreSQL schema initialized ✓");
  }).catch((err: unknown) => {
    initPromise = null;
    throw err;
  }) as Promise<void>;

  initPromise = p;
  return p;
}