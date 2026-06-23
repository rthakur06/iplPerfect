import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

const COOKIE = "ips_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

export interface AuthUser {
  id: number;
  username: string;
}

/** scrypt with a per-user random salt, stored as "salt:hash". */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const db = await getDb();
  await db.execute({
    sql: "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
    args: [token, userId, new Date().toISOString()],
  });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.execute({ sql: "DELETE FROM sessions WHERE token = ?", args: [token] });
  }
  store.delete(COOKIE);
}

export async function currentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const { rows } = await db.execute({
    sql: "SELECT u.id AS id, u.username AS username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
    args: [token],
  });
  const row = rows[0];
  return row ? { id: Number(row.id), username: String(row.username) } : null;
}
