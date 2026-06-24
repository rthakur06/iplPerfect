import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// libSQL/Turso client. Locally (and in any persistent-disk host) it falls back to an embedded
// SQLite file at .data/app.db; on Vercel/serverless set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN to a
// hosted Turso database so accounts actually persist across requests. The client is async, so every
// caller awaits getDb().
let ready: Promise<Client> | null = null;

function createConn(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (url) return createClient({ url, authToken });
  // Local fallback: embedded file. Ensure the directory exists first.
  mkdirSync(resolve(process.cwd(), ".data"), { recursive: true });
  return createClient({ url: `file:${resolve(process.cwd(), ".data", "app.db")}` });
}

async function init(c: Client): Promise<Client> {
  await c.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    )`);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      tier TEXT NOT NULL,
      final_rank INTEGER NOT NULL,
      points INTEGER NOT NULL,
      wins INTEGER NOT NULL,
      won_title INTEGER NOT NULL,
      overall INTEGER NOT NULL DEFAULT 0,
      xi_json TEXT NOT NULL,
      detail_json TEXT
    )`);

  // Migrate an older users table (email-required, separate "name" column) to the username-based
  // schema so accounts now sign in by username and email is optional. Only runs on a pre-existing
  // legacy DB; a fresh database is already created in the new shape above.
  const info = await c.execute("PRAGMA table_info(users)");
  const cols = info.rows.map((r) => String(r.name));
  if (cols.length > 0 && !cols.includes("username")) {
    // sessions.user_id references users(id); ids are preserved through the rebuild, so existing
    // sessions stay valid. PRAGMA can't run inside a transaction, so these are sequential.
    await c.execute("PRAGMA foreign_keys = OFF");
    await c.execute(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`);
    await c.execute(
      `INSERT INTO users_new (id, username, email, password_hash, created_at)
       SELECT id, COALESCE(NULLIF(name, ''), 'player' || id), email, password_hash, created_at FROM users`
    );
    await c.execute("DROP TABLE users");
    await c.execute("ALTER TABLE users_new RENAME TO users");
    await c.execute("PRAGMA foreign_keys = ON");
  }

  // Guarded migrations for older runs tables.
  for (const stmt of [
    "ALTER TABLE runs ADD COLUMN detail_json TEXT",
    "ALTER TABLE runs ADD COLUMN overall INTEGER NOT NULL DEFAULT 0",
  ]) {
    try {
      await c.execute(stmt);
    } catch {
      /* column already exists */
    }
  }

  await c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE)");

  // Fixed-window rate-limit counters (one row per key+window). Works on serverless because the
  // state lives in the shared DB, not process memory.
  await c.execute(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
  return c;
}

export function getDb(): Promise<Client> {
  if (!ready) {
    const conn = createConn();
    ready = init(conn).catch((err) => {
      ready = null; // don't cache a half-initialised connection
      throw err;
    });
  }
  return ready;
}
