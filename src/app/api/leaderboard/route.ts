import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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

const TOP_N = 10;

interface Row {
  username: string;
  difficulty: string;
  tier: string;
  points: number;
  wins: number;
  finalRank: number;
  wonTitle: number;
  overall: number;
}

export interface LeaderEntry {
  username: string;
  overall: number;
  tier: string;
  points: number;
  wins: number;
  finalRank: number;
  wonTitle: boolean;
}

/** Tiebreak when two players share the same team overall: better season result wins, then points,
 *  wins, and table finish. */
function tiebreak(r: Row): number {
  const tierIdx = Math.max(0, TIER_ORDER.indexOf(r.tier));
  return tierIdx * 1000 + r.points * 20 + r.wins * 5 + Math.max(0, 15 - r.finalRank);
}

export async function GET() {
  const db = await getDb();
  const result = await db.execute(
    `SELECT u.username AS username, r.difficulty AS difficulty, r.tier AS tier,
            r.points AS points, r.wins AS wins, r.final_rank AS finalRank,
            r.won_title AS wonTitle, r.overall AS overall
     FROM runs r JOIN users u ON u.id = r.user_id`
  );
  const rows = result.rows as unknown as Row[];

  // Rank by the team OVERALL each player achieved — their single strongest XI per difficulty.
  const build = (difficulty: "easy" | "hard"): LeaderEntry[] => {
    const bestByUser = new Map<string, { entry: LeaderEntry; tb: number }>();
    for (const r of rows) {
      if (r.difficulty !== difficulty) continue;
      const tb = tiebreak(r);
      const prev = bestByUser.get(r.username);
      if (!prev || r.overall > prev.entry.overall || (r.overall === prev.entry.overall && tb > prev.tb)) {
        bestByUser.set(r.username, {
          tb,
          entry: {
            username: r.username,
            overall: r.overall,
            tier: r.tier,
            points: r.points,
            wins: r.wins,
            finalRank: r.finalRank,
            wonTitle: !!r.wonTitle,
          },
        });
      }
    }
    return [...bestByUser.values()]
      .map((x) => x.entry)
      .sort((a, b) => b.overall - a.overall || tiebreakEntry(b) - tiebreakEntry(a))
      .slice(0, TOP_N);
  };

  return NextResponse.json({ easy: build("easy"), hard: build("hard") });
}

function tiebreakEntry(e: LeaderEntry): number {
  const tierIdx = Math.max(0, TIER_ORDER.indexOf(e.tier));
  return tierIdx * 1000 + e.points * 20 + e.wins * 5 + Math.max(0, 15 - e.finalRank);
}
