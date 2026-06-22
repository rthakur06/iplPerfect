import type { SeasonOdds, TeamRatingBreakdown } from "./types";

// Calibrated against the real dataset via scripts/calibrate-odds.ts, not guessed. Over 2000
// simulated "11 random spins, draft best eligible each time" runs on the current 0-100 scale
// (team metrics are now monotonic sums over fixed divisors, with no balance penalty):
//   overall p10=56  p50=60  p90=63  mean=60
// A thoughtfully balanced draft can push overall into the mid-to-high 60s, so "league average"
// is ~60 and "title-worthy" sits a handful of points above.
const LEAGUE_AVG_OVERALL = 60;
const TITLE_THRESHOLD = 65; // reachable with a strong, balanced XI — not guaranteed even then
const WOODEN_SPOON_THRESHOLD = 57; // roughly the p10 random-draft outcome — genuinely poor drafting
const LOGISTIC_K = 0.7; // tuned to the ~5-8 point spread between league-average and title-worthy

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Maps team Overall (+ balance) to a pre-season "scouting report" — not the result. */
export function computeSeasonOdds(rating: TeamRatingBreakdown): SeasonOdds {
  const delta = rating.overall - LEAGUE_AVG_OVERALL;

  // 14 league-stage games at 2 pts/win. Multiplier scaled for the real ~±8-point delta range on
  // the current scale (see calibration note above).
  const expectedPoints = clamp(14 + delta * 1.2, 0, 28);

  const projectedFinish = clamp(Math.round(6 - delta / 1.2), 1, 10);

  const titleOdds = logistic(LOGISTIC_K * (rating.overall - TITLE_THRESHOLD));
  const wodenSpoonOdds = logistic(LOGISTIC_K * (WOODEN_SPOON_THRESHOLD - rating.overall));

  return { projectedFinish, expectedPoints, titleOdds, wodenSpoonOdds };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
