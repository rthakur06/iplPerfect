import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

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

  if (!row || !verifyPassword(password, String(row.password_hash))) {
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  const id = Number(row.id);
  await createSession(id);
  return NextResponse.json({ user: { id, username: String(row.username) } });
}
