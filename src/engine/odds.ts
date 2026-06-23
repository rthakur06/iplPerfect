import type { SeasonOdds, TeamRatingBreakdown } from "./types";

// Fitted to the post-rebalance simulation (15-team league of strong real sides + the playoff
// gauntlet). Measured outcomes by team overall: ~60 finishes 1st-2nd and makes playoffs ~all the
// time but only sweeps unbeaten ~13%; the title (beating the All-Time XI) needs ~70+ — 23% at 70,
// 56% at 75. So "title-worthy" sits up near 74, well above a typical good draft.
const LEAGUE_AVG_OVERALL = 60; // a 60 side projects to finish ~2nd of 15
const TITLE_THRESHOLD = 74; // the gauntlet is the wall — title odds only get real in the 70s
const WOODEN_SPOON_THRESHOLD = 53; // below this you genuinely risk the bottom of the table
const LOGISTIC_K = 0.3;

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Maps team Overall to a pre-season "scouting report" — not the result. */
export function computeSeasonOdds(rating: TeamRatingBreakdown): SeasonOdds {
  const delta = rating.overall - LEAGUE_AVG_OVERALL;

  // 14 league games at 2 pts/win; a 60 side averages ~24 pts, falling ~1.4 pts per point of overall.
  const expectedPoints = clamp(Math.round(24 + delta * 1.4), 0, 28);

  // 15-team league: a 60 side projects ~2nd, climbing/sliding ~0.8 places per point of overall.
  const projectedFinish = clamp(Math.round(2 - delta * 0.8), 1, 15);

  const titleOdds = logistic(LOGISTIC_K * (rating.overall - TITLE_THRESHOLD));
  const wodenSpoonOdds = logistic(LOGISTIC_K * (WOODEN_SPOON_THRESHOLD - rating.overall));

  return { projectedFinish, expectedPoints, titleOdds, wodenSpoonOdds };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
