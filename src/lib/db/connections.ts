
// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — PostgreSQL Connection Pool (Singleton)
// ─────────────────────────────────────────────────────────────────────────────

import { Pool } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  return new Pool({
    connectionString:    process.env.DATABASE_URL,
    max:                 10,
    idleTimeoutMillis:   30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
  });
}

// Reuse pool across hot-reloads in Next.js dev mode
const pool: Pool = global.__pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

pool.on("connect", () => console.log("[DB] PostgreSQL connected ✓"));
pool.on("error",   (err) => console.error("[DB] Pool error:", err.message));

export { pool };
export default pool;