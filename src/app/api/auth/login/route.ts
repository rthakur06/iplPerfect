import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

// A valid-shape hash to verify against when the username doesn't exist, so login takes the same time
// whether or not the account exists (no username-enumeration timing oracle).
const DUMMY_HASH = "0".repeat(32) + ":" + "0".repeat(128);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  const db = await getDb();
  const { rows } = await db.execute({
    sql: "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
    args: [username],
  });
  const row = rows[0] as unknown as { id: number; username: string; password_hash: string } | undefined;

  // Always run the password hash (against a dummy when there's no such user) to equalize timing.
  const passwordOk = verifyPassword(password, row ? String(row.password_hash) : DUMMY_HASH);
  if (!row || !passwordOk) {
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  const id = Number(row.id);
  await createSession(id);
  return NextResponse.json({ user: { id, username: String(row.username) } });
}
