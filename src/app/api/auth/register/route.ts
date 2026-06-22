import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const db = getDb();
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    return NextResponse.json({ error: "That email is already registered — try signing in." }, { status: 409 });
  }

  const info = db
    .prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)")
    .run(email, hashPassword(password), new Date().toISOString());
  await createSession(Number(info.lastInsertRowid));

  return NextResponse.json({ email });
}
