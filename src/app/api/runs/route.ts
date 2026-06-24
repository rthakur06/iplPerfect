import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { PLAYER_SEASONS_BY_ID } from "@/engine/data/dataset";
import { computeTeamRating } from "@/engine/rating";
import { validateXi, XI_SIZE } from "@/engine/rules";
import { simulateSeason } from "@/engine/sim";
import { buildVerdict } from "@/engine/verdict";
import { buildXiSeedKey } from "@/engine/rng";
import { rateLimit } from "@/lib/rateLimit";
import { toDisplayTeamRating } from "@/app/displayRating";
import type { DraftSlot, PlayerSeason, SimRosterPlayer } from "@/engine/types";

export const runtime = "nodejs";

const playersById = new Map(Object.entries(PLAYER_SEASONS_BY_ID)) as Map<string, PlayerSeason>;

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

  // Throttle run submissions per user.
  if (!(await rateLimit(`runs:${user.id}`, 20, 5 * 60_000))) {
    return NextResponse.json({ error: "Too many runs too fast — slow down a moment." }, { status: 429 });
  }

  const b = await req.json().catch(() => ({}));

  // SECURITY: the result is NOT trusted from the client — that would let anyone POST a fake
  // top-of-the-leaderboard run. The client only sends the XI (ordered player ids) + difficulty, and
  // the server re-runs the deterministic simulation to derive the real result. So the leaderboard
  // can only show seasons that an actual legal XI genuinely produces.
  const playerIds: unknown = b.playerIds;
  if (!Array.isArray(playerIds) || playerIds.length !== XI_SIZE || !playerIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "Invalid XI." }, { status: 400 });
  }
  const ids = playerIds as string[];
  if (new Set(ids).size !== XI_SIZE) {
    return NextResponse.json({ error: "Duplicate players in XI." }, { status: 400 });
  }

  const slots: DraftSlot[] = ids.map((id, index) => ({ index, playerId: id }));
  const players = ids.map((id) => playersById.get(id));
  if (players.some((p) => p == null)) {
    return NextResponse.json({ error: "Unknown player in XI." }, { status: 400 });
  }
  // No drafting the same real person twice (different seasons of one player share a personId).
  if (new Set((players as PlayerSeason[]).map((p) => p.personId)).size !== XI_SIZE) {
    return NextResponse.json({ error: "Same player drafted twice." }, { status: 400 });
  }
  const validation = validateXi(slots, playersById);
  if (!validation.valid) {
    return NextResponse.json({ error: "XI is not a legal team." }, { status: 400 });
  }

  // Re-derive the entire result server-side.
  const rating = computeTeamRating(slots, playersById);
  const roster: SimRosterPlayer[] = (players as PlayerSeason[]).map((p, i) => ({
    id: p.id,
    name: p.name,
    slotIndex: i,
    bowls: p.bowlingRole !== "NONE",
    bowlType: p.bowlingRole,
    bat: p.rating.bat,
    bowl: p.rating.bowl,
    field: p.rating.field,
  }));
  const result = simulateSeason(buildXiSeedKey(ids), rating, roster);
  const verdict = buildVerdict(result);
  const wins = result.leagueStage.filter((m) => m.won).length;
  const xi = (players as PlayerSeason[]).map((p) => ({ name: p.name, ovr: p.rating.ovr }));
  const detail = JSON.stringify({ result, verdict }).slice(0, 200000);

  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO runs (user_id, created_at, difficulty, tier, final_rank, points, wins, won_title, overall, xi_json, detail_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      user.id,
      new Date().toISOString(),
      b.difficulty === "hard" ? "hard" : "easy",
      verdict.tier,
      result.finalRank,
      result.points,
      wins,
      result.wonTitle ? 1 : 0,
      toDisplayTeamRating(rating.overall),
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
