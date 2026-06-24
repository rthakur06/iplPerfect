import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function POST(req: Request) {
  // Limit account creation per IP.
  if (!(await rateLimit(`register:${clientIp(req)}`, 5, 60 * 60_000))) {
    return NextResponse.json({ error: "Too many sign-ups from here — try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3–20 letters, numbers, or underscores." },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const db = await getDb();
  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE username = ? COLLATE NOCASE",
    args: [username],
  });
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "That username is taken — try another." }, { status: 409 });
  }

  const info = await db.execute({
    sql: "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
    args: [username, hashPassword(password), new Date().toISOString()],
  });
  const id = Number(info.lastInsertRowid);
  await createSession(id);

  return NextResponse.json({ user: { id, username } });
}
