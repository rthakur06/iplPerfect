import type { SeasonOdds, TeamRatingBreakdown } from "./types";

// These curves are fitted to the ACTUAL simulation (a 14-game league weighted hard toward the
// strongest sides in history, then a three-match playoff gauntlet that ends against the All-Time
// XI). They're stated on the engine's raw internal overall scale, where real team-seasons span
// ~43-56 and the all-time bosses sit ~63-66 — so the achievable range for a good draft is roughly
// the low 50s to low 60s.
//
// Measured outcomes by team overall (4k seeds/point), with the tougher league table (sim.ts) and the
// playoff gauntlet boost (PLAYOFF_TEAM_BOOST = 12) both in effect:
//   overall  playoff%  title%  unbeaten%  avgFinish   (display rating)
//      56       48        6       1.4        4.8         ~81
//      58       75       18       5.3        3.3         ~86
//      60       92       33      14.0        2.2         ~90  (wins a few playoff games)
//      62       98       50      29.7        1.5         ~94  (coin-flip for the title)
//      64      100       64      49.0        1.2         ~99  (all-time XI)
// The title is now genuinely winnable for a top draft, matching the team-rating bands in
// displayRating.ts. The curves below reproduce these measured rates.
const LOGISTIC = {
  playoff: { k: 0.6, mid: 56 },
  title: { k: 0.4, mid: 62 },
  unbeaten: { k: 0.44, mid: 64 },
  woodenSpoon: { k: 0.45, mid: 50 }, // risk of finishing at the bottom of the table
};

function logistic(k: number, x: number, mid: number): number {
  return 1 / (1 + Math.exp(-k * (x - mid)));
}

/** Maps team Overall to a pre-season "scouting report" — a projection, not the result. */
export function computeSeasonOdds(rating: TeamRatingBreakdown): SeasonOdds {
  const overall = rating.overall;

  // Around a 50-overall side: ~13 points and a lower-table finish. Points climb with win rate
  // (~1.45 pts/overall); projected finish falls ~0.77 places per point against the tougher field.
  const expectedPoints = clamp(Math.round(13 + (overall - 50) * 1.45), 0, 28);
  const projectedFinish = clamp(Math.round(9.9 - (overall - 50) * 0.77), 1, 15);

  return {
    expectedPoints,
    projectedFinish,
    playoffOdds: logistic(LOGISTIC.playoff.k, overall, LOGISTIC.playoff.mid),
    titleOdds: logistic(LOGISTIC.title.k, overall, LOGISTIC.title.mid),
    unbeatenOdds: logistic(LOGISTIC.unbeaten.k, overall, LOGISTIC.unbeaten.mid),
    wodenSpoonOdds: logistic(LOGISTIC.woodenSpoon.k, -overall, -LOGISTIC.woodenSpoon.mid),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
