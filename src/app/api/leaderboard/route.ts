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
}

export interface LeaderEntry {
  username: string;
  score: number;
  tier: string;
  points: number;
  wins: number;
  finalRank: number;
  wonTitle: boolean;
}

/** A single sortable season score: tier dominates, then points, then wins, then a better (lower)
 *  table finish. Keeps the ranking intuitive — a title-winning season always outranks a mid-table
 *  one regardless of points. */
function seasonScore(r: Row): number {
  const tierIdx = Math.max(0, TIER_ORDER.indexOf(r.tier));
  return tierIdx * 1000 + r.points * 20 + r.wins * 5 + Math.max(0, 15 - r.finalRank);
}

export async function GET() {
  const db = await getDb();
  const result = await db.execute(
    `SELECT u.username AS username, r.difficulty AS difficulty, r.tier AS tier,
            r.points AS points, r.wins AS wins, r.final_rank AS finalRank, r.won_title AS wonTitle
     FROM runs r JOIN users u ON u.id = r.user_id`
  );
  const rows = result.rows as unknown as Row[];

  const build = (difficulty: "easy" | "hard"): LeaderEntry[] => {
    const bestByUser = new Map<string, LeaderEntry>();
    for (const r of rows) {
      if (r.difficulty !== difficulty) continue;
      const score = seasonScore(r);
      const prev = bestByUser.get(r.username);
      if (!prev || score > prev.score) {
        bestByUser.set(r.username, {
          username: r.username,
          score,
          tier: r.tier,
          points: r.points,
          wins: r.wins,
          finalRank: r.finalRank,
          wonTitle: !!r.wonTitle,
        });
      }
    }
    return [...bestByUser.values()].sort((a, b) => b.score - a.score).slice(0, TOP_N);
  };

  return NextResponse.json({ easy: build("easy"), hard: build("hard") });
}
