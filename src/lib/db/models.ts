// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — PostgreSQL Schema (replaces Mongoose models)
//  Run once on startup to create tables if they don't exist
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from "./connections";

export async function initSchema(): Promise<void> {
  await pool.query(`
    -- Tasks table
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

    -- Indexes for atomic claim query
    CREATE INDEX IF NOT EXISTS idx_tasks_claim
      ON tasks (status, priority_level DESC, next_retry_at ASC)
      WHERE dlq = FALSE;

    CREATE INDEX IF NOT EXISTS idx_tasks_heartbeat
      ON tasks (status, last_heartbeat)
      WHERE status = 'CLAIMED';

    -- Idempotency table
    CREATE TABLE IF NOT EXISTS idempotency_records (
      id               SERIAL PRIMARY KEY,
      idempotency_key  TEXT        NOT NULL UNIQUE,
      task_id          UUID        NOT NULL,
      result           JSONB,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at       TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_idempotency_key
      ON idempotency_records (idempotency_key);

    CREATE INDEX IF NOT EXISTS idx_idempotency_expires
      ON idempotency_records (expires_at);

    -- Dead Letter Queue table
    CREATE TABLE IF NOT EXISTS dlq_entries (
      id            SERIAL PRIMARY KEY,
      task_id       UUID        NOT NULL,
      original_task JSONB       NOT NULL,
      reason        TEXT        NOT NULL,
      moved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_dlq_task_id
      ON dlq_entries (task_id);

    -- Workers table
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

    CREATE INDEX IF NOT EXISTS idx_workers_status
      ON workers (status);

    -- Auto-update updated_at on tasks
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
    CREATE TRIGGER tasks_updated_at
      BEFORE UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  `);

  console.log("[DB] PostgreSQL schema initialized ✓");
}
