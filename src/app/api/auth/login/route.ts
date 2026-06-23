import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const row = getDb()
    .prepare("SELECT id, name, password_hash FROM users WHERE email = ?")
    .get(email) as { id: number; name: string; password_hash: string } | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  }

  await createSession(row.id);
  return NextResponse.json({ email, name: row.name });
}
