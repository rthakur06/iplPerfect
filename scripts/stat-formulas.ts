// Shared raw-stat derivations, used by both compute-ratings.ts (rating calibration) and
// assemble-dataset.ts (display stats shown alongside ratings in the UI).

export interface BattingStats {
  innings: number;
  runs: number;
  balls: number;
  dismissals: number;
  fours: number;
  sixes: number;
  positionSum: number; // sum of batting-order positions across innings (1 = opener)
}
export interface BowlingStats {
  balls: number;
  runsConceded: number;
  wickets: number;
}

export function battingAverage(b: BattingStats): number {
  return b.dismissals > 0 ? b.runs / b.dismissals : b.runs; // not-out across whole sample: treat runs as the "average"
}
export function strikeRate(b: BattingStats): number {
  return b.balls > 0 ? (b.runs / b.balls) * 100 : 0;
}
export function economy(b: BowlingStats): number {
  return b.balls > 0 ? b.runsConceded / (b.balls / 6) : 0;
}
export function wicketRatePerOver(b: BowlingStats): number {
  return b.balls > 0 ? b.wickets / (b.balls / 6) : 0;
}
export function bowlingStrikeRate(b: BowlingStats): number {
  return b.wickets > 0 ? b.balls / b.wickets : 0; // balls per wicket
}
export function avgBattingPosition(b: BattingStats): number {
  return b.innings > 0 ? b.positionSum / b.innings : 99; // 99 = never batted, sorts to the tail
}
