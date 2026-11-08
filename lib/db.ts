// Database layer with two backends behind one async API:
//  - Postgres (Neon, Supabase, ...) when DATABASE_URL is set. Use this when hosting on Vercel.
//  - SQLite file (Node's built-in node:sqlite) otherwise, for zero-setup local dev.
// Write SQL with `?` placeholders; they are rewritten to $1, $2, ... for Postgres.
// Quote camelCase aliases (AS "hadImage") because Postgres lowercases bare ones.
import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Pool, PoolClient } from "pg";

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  aspect TEXT NOT NULL,
  duration INTEGER NOT NULL,
  had_image INTEGER NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL,
  status TEXT NOT NULL,
  output TEXT,
  error TEXT,
  refunded INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  finished_at BIGINT
);
CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON credit_ledger(user_id, id DESC);
CREATE TABLE IF NOT EXISTS payments (
  stripe_session_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack TEXT NOT NULL,
  credits INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);
`;

const SQLITE_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
${PG_SCHEMA.replaceAll("SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT").replaceAll("BIGINT", "INTEGER")}
`;

/** Something you can run SQL on: the database itself, or an open transaction. */
export interface Db {
  /** All rows. */
  all<T = any>(sql: string, ...params: unknown[]): Promise<T[]>;
  /** First row, or undefined. */
  get<T = any>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  /** Number of rows changed. */
  run(sql: string, ...params: unknown[]): Promise<number>;
}

const usePg = () => !!process.env.DATABASE_URL?.trim();

// ---------- Postgres ----------

const g = globalThis as unknown as { __pg?: Promise<Pool>; __sqlite?: any; __sqliteLock?: Promise<unknown> };

const toPg = (sql: string) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

function pool(): Promise<Pool> {
  g.__pg ??= (async () => {
    const pg = await import("pg");
    const { Pool, types } = pg.default ?? pg;
    types.setTypeParser(20, (v: string) => Number(v)); // BIGINT (timestamps in ms) as numbers
    const p = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10_000 });
    await p.query(PG_SCHEMA);
    return p;
  })().catch((e) => {
    g.__pg = undefined; // retry on the next request
    throw e;
  });
  return g.__pg;
}

function pgDb(c: Pool | PoolClient): Db {
  return {
    all: async (sql, ...p) => (await c.query(toPg(sql), p)).rows,
    get: async (sql, ...p) => (await c.query(toPg(sql), p)).rows[0],
    run: async (sql, ...p) => (await c.query(toPg(sql), p)).rowCount ?? 0,
  };
}

// ---------- SQLite ----------

async function sqlite() {
  if (!g.__sqlite) {
    const { DatabaseSync } = await import("node:sqlite");
    const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
    mkdirSync(path.dirname(file), { recursive: true });
    const conn = new DatabaseSync(file);
    conn.exec(SQLITE_SCHEMA);
    g.__sqlite = conn;
  }
  return g.__sqlite as import("node:sqlite").DatabaseSync;
}

function sqliteDb(c: import("node:sqlite").DatabaseSync): Db {
  const args = (p: unknown[]) => p as any[];
  return {
    all: async (sql, ...p) => c.prepare(sql).all(...args(p)) as any[],
    get: async (sql, ...p) => c.prepare(sql).get(...args(p)) as any,
    run: async (sql, ...p) => Number(c.prepare(sql).run(...args(p)).changes),
  };
}

// ---------- public API ----------

export async function db(): Promise<Db> {
  return usePg() ? pgDb(await pool()) : sqliteDb(await sqlite());
}

/** Run fn inside a transaction; rolls back if it throws. */
export async function tx<T>(fn: (d: Db) => Promise<T>): Promise<T> {
  if (usePg()) {
    const client = await (await pool()).connect();
    try {
      await client.query("BEGIN");
      const out = await fn(pgDb(client));
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  // SQLite has one connection, so run transactions one at a time.
  const conn = await sqlite();
  const prev = g.__sqliteLock ?? Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    conn.exec("BEGIN IMMEDIATE");
    try {
      const out = await fn(sqliteDb(conn));
      conn.exec("COMMIT");
      return out;
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    }
  });
  g.__sqliteLock = run;
  return run;
}

/** True for a unique-constraint violation on either backend. */
export function isUniqueViolation(e: any) {
  return e?.code === "23505" || String(e?.message ?? "").includes("UNIQUE");
}
