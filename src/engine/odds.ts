import type { SeasonOdds, TeamRatingBreakdown } from "./types";

// These curves are fitted to the ACTUAL simulation (a 14-game league weighted hard toward the
// strongest sides in history, then a three-match playoff gauntlet that ends against the All-Time
// XI). They're stated on the engine's raw internal overall scale, where real team-seasons span
// ~43-56 and the all-time bosses sit ~63-66 — so the achievable range for a good draft is roughly
// the low 50s to low 60s.
//
// Measured outcomes by team overall (3-4k seeds/point), with the steep match engine (sim.ts), the
// tough league table, and the playoff boost (PLAYOFF_TEAM_BOOST = 9) all in effect:
//   overall  avgWins  playoff%  title%  unbeaten%  (display rating via toDisplayTeamRating)
//      56      11.4      75        12       5          ~85
//      59      12.8      98        16      28          ~90  (13-1, dominates the league)
//      62      13.6     100        40      67          ~94  (strong title shot)
//      63      13.7     100        54      76          ~96  (probable champion)
//      65      13.8     100       ~65      88          ~99  (best XI you can build)
// A 90 dominates the league; the title gets probable around 95-96. Curves reproduce these rates.
const LOGISTIC = {
  playoff: { k: 0.88, mid: 54.6 },
  title: { k: 0.42, mid: 63 },
  unbeaten: { k: 0.55, mid: 60.7 },
  woodenSpoon: { k: 0.45, mid: 48 }, // risk of a losing record
};

function logistic(k: number, x: number, mid: number): number {
  return 1 / (1 + Math.exp(-k * (x - mid)));
}

/** Maps team Overall to a pre-season "scouting report" — a projection, not the result. */
export function computeSeasonOdds(rating: TeamRatingBreakdown): SeasonOdds {
  const overall = rating.overall;

  // Strong teams pull away fast under the steep engine: ~20 points at internal 54, climbing ~1.1
  // per point of overall; projected finish climbs ~0.83 places per point.
  const expectedPoints = clamp(Math.round(20 + (overall - 54) * 1.1), 0, 28);
  const projectedFinish = clamp(Math.round(4.5 - (overall - 55) * 0.83), 1, 15);

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
