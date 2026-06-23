import type { SeasonOdds, TeamRatingBreakdown } from "./types";

// These curves are fitted to the ACTUAL simulation (a 14-game league weighted hard toward the
// strongest sides in history, then a three-match playoff gauntlet that ends against the All-Time
// XI). They're stated on the engine's raw internal overall scale, where real team-seasons span
// ~43-56 and the all-time bosses sit ~63-66 — so the achievable range for a good draft is roughly
// the low 50s to low 60s.
//
// Measured outcomes by team overall (3k seeds/point):
//   overall  playoff%  title%  unbeaten%   avg finish
//      50       13       0         0           7.5
//      54       66       0         0.2         3.8
//      58       98       0.1       5           1.6
//      62      100       1         30          1.0
//      66      100       7        66           1.0
// The title is meant to be a genuine wall — beating the greatest XI ever assembled three rounds in
// a row is rare even for an elite side. The curves below reproduce those measured rates.
const LOGISTIC = {
  playoff: { k: 0.64, mid: 53 },
  title: { k: 0.42, mid: 72 },
  unbeaten: { k: 0.44, mid: 64 },
  woodenSpoon: { k: 0.5, mid: 47 }, // risk of finishing at the bottom of the table
};

function logistic(k: number, x: number, mid: number): number {
  return 1 / (1 + Math.exp(-k * (x - mid)));
}

/** Maps team Overall to a pre-season "scouting report" — a projection, not the result. */
export function computeSeasonOdds(rating: TeamRatingBreakdown): SeasonOdds {
  const overall = rating.overall;

  // Around a 50-overall side: ~13 points and a lower-mid-table finish, each climbing steeply with
  // overall (one point of overall is worth ~1.45 league points and ~0.74 table places).
  const expectedPoints = clamp(Math.round(13 + (overall - 50) * 1.45), 0, 28);
  const projectedFinish = clamp(Math.round(7.6 - (overall - 50) * 0.74), 1, 15);

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
