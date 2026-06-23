import type { SeasonOdds, TeamRatingBreakdown } from "./types";

// These curves are fitted to the ACTUAL simulation (a 14-game league weighted hard toward the
// strongest sides in history, then a three-match playoff gauntlet that ends against the All-Time
// XI). They're stated on the engine's raw internal overall scale, where real team-seasons span
// ~43-56 and the all-time bosses sit ~63-66 — so the achievable range for a good draft is roughly
// the low 50s to low 60s.
//
// Measured outcomes by team overall (2.5k seeds/point), with the tougher league table (sim.ts) and
// the playoff gauntlet boost (PLAYOFF_TEAM_BOOST) both in effect:
//   overall  1st%  playoff%  title%  unbeaten%  avgFinish
//      54      2      22       0.5      0.2         6.8
//      56     11      50       2.5      1.4         4.8
//      58     27      76       8.4      5.3         3.3
//      60     51      91      17.6     14.0         2.2
//      62     73      98      29.9     29.7         1.5
//      64     88     100      43.4     49.0         1.2
// Finishing 1st and reaching the playoffs both take a genuinely strong campaign now; the title
// stays a real-but-earned prize for an elite draft. The curves below reproduce those measured rates.
const LOGISTIC = {
  playoff: { k: 0.6, mid: 56 },
  title: { k: 0.32, mid: 65 },
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
