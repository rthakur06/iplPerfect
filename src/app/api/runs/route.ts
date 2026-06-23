import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";

// Worst -> best, so a higher index is a better season.
const TIER_ORDER = [
  "WOODEN_SPOON",
  "MID_TABLE",
  "PLAYOFF_BOUND",
  "FINALIST",
  "CHAMPIONS",
  "UNBEATEN_LEAGUE_STAGE",
  "PERFECT_SEASON",
];

interface RunRow {
  id: number;
  created_at: string;
  difficulty: string;
  tier: string;
  final_rank: number;
  points: number;
  wins: number;
  won_title: number;
  xi_json: string;
  has_detail: number;
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save runs." }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  if (typeof b.tier !== "string" || !TIER_ORDER.includes(b.tier)) {
    return NextResponse.json({ error: "Invalid run." }, { status: 400 });
  }
  const xi = Array.isArray(b.xi) ? b.xi : [];

  const detail = b.detail ? JSON.stringify(b.detail).slice(0, 200000) : null;

  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO runs (user_id, created_at, difficulty, tier, final_rank, points, wins, won_title, overall, xi_json, detail_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      user.id,
      new Date().toISOString(),
      b.difficulty === "hard" ? "hard" : "easy",
      b.tier,
      Number(b.finalRank) || 0,
      Number(b.points) || 0,
      Number(b.wins) || 0,
      b.wonTitle ? 1 : 0,
      Number(b.overall) || 0,
      JSON.stringify(xi),
      detail,
    ],
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT id, created_at, difficulty, tier, final_rank, points, wins, won_title, xi_json,
                 (detail_json IS NOT NULL) AS has_detail
          FROM runs WHERE user_id = ? ORDER BY created_at DESC`,
    args: [user.id],
  });
  const rows = result.rows as unknown as RunRow[];

  const runs = rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    difficulty: r.difficulty,
    tier: r.tier,
    finalRank: r.final_rank,
    points: r.points,
    wins: r.wins,
    wonTitle: !!r.won_title,
    xi: safeParse(r.xi_json),
    hasDetail: !!r.has_detail,
  }));

  // ── Aggregates for the history header ──────────────────────────────────────
  let best: (typeof runs)[number] | null = null;
  for (const run of runs) {
    if (!best) {
      best = run;
      continue;
    }
    const a = TIER_ORDER.indexOf(run.tier);
    const b = TIER_ORDER.indexOf(best.tier);
    if (a > b || (a === b && run.points > best.points)) best = run;
  }

  const n = runs.length;
  const avgWins = n ? runs.reduce((s, r) => s + r.wins, 0) / n : 0;
  const avgRank = n ? runs.reduce((s, r) => s + r.finalRank, 0) / n : 0;
  const titles = runs.filter((r) => r.wonTitle).length;

  // Favorite player = most-drafted across every saved XI.
  const counts = new Map<string, number>();
  for (const run of runs) {
    for (const p of run.xi) {
      const name = typeof p === "string" ? p : p?.name;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  let favoritePlayer: { name: string; count: number } | null = null;
  for (const [name, count] of counts) {
    if (!favoritePlayer || count > favoritePlayer.count) favoritePlayer = { name, count };
  }

  return NextResponse.json({
    runs,
    stats: {
      totalRuns: n,
      avgWins: Math.round(avgWins * 10) / 10,
      avgRank: Math.round(avgRank * 10) / 10,
      titles,
      bestRun: best,
      favoritePlayer,
    },
  });
}

function safeParse(json: string): { name: string; ovr?: number }[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
