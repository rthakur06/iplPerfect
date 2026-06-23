import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const row = getDb()
    .prepare("SELECT detail_json FROM runs WHERE id = ? AND user_id = ?")
    .get(Number(id), user.id) as { detail_json: string | null } | undefined;

  if (!row) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (!row.detail_json) return NextResponse.json({ detail: null });

  try {
    return NextResponse.json({ detail: JSON.parse(row.detail_json) });
  } catch {
    return NextResponse.json({ detail: null });
  }
}
