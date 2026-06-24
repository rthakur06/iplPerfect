import type { SeasonOdds, TeamRatingBreakdown } from "./types";

// These curves are fitted to the ACTUAL simulation (a 14-game league weighted hard toward the
// strongest sides in history, then a three-match playoff gauntlet that ends against the All-Time
// XI). They're stated on the engine's raw internal overall scale, where real team-seasons span
// ~43-56 and the all-time bosses sit ~63-66 — so the achievable range for a good draft is roughly
// the low 50s to low 60s.
//
// Measured outcomes by team overall (4k seeds/point), with the match engine (sim.ts), the league
// table, and the playoff boost (PLAYOFF_TEAM_BOOST = 7) all in effect. Tuned (June 2026) so the
// championship is hard and a perfect record is extremely rare, while playoffs stay reachable:
//   overall  avgWins  playoff%  title%  unbeaten%  perfect%  (display via toDisplayTeamRating)
//      56      10.4      50         1       1        0.0       ~84
//      60      12.3      91        11      15        2.1       ~90  (strong; ~12-2)
//      62      12.9      98        20      30        5.9       ~93
//      64      13.3      99        32      50       15.4       ~96  (the best XI you can build)
// Even the best realistic side wins the title only ~1 in 3 and goes unbeaten ~half the time, and a
// 96 is itself near-impossible to draft — so champions are hard and perfect seasons very rare.
const LOGISTIC = {
  playoff: { k: 0.58, mid: 56 },
  title: { k: 0.34, mid: 66 },
  unbeaten: { k: 0.43, mid: 64 },
  woodenSpoon: { k: 0.45, mid: 48 }, // risk of a losing record
};

function logistic(k: number, x: number, mid: number): number {
  return 1 / (1 + Math.exp(-k * (x - mid)));
}

/** Maps team Overall to a pre-season "scouting report" — a projection, not the result. */
export function computeSeasonOdds(rating: TeamRatingBreakdown): SeasonOdds {
  const overall = rating.overall;

  // ~21 points at internal 56, climbing ~0.72 per point of overall; projected finish climbs ~0.75
  // places per point against the strong field.
  const expectedPoints = clamp(Math.round(21 + (overall - 56) * 0.72), 0, 28);
  const projectedFinish = clamp(Math.round(5 - (overall - 56) * 0.75), 1, 15);

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
