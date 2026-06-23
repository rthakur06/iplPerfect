import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Single shared SQLite connection (node:sqlite is built into Node, no native build step). The DB
// file lives in .data/ at the project root and is gitignored. Tables are created on first open.
let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const dir = resolve(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(resolve(dir, "app.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );
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
      xi_json TEXT NOT NULL,
      detail_json TEXT
    );
  `);

  // Guarded migrations for databases created before these columns existed.
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE runs ADD COLUMN detail_json TEXT",
  ]) {
    try {
      db.exec(stmt);
    } catch {
      /* column already exists */
    }
  }
  return db;
}
