import type { DraftSlot, PlayerSeason, TeamRatingBreakdown } from "./types";

const WEIGHTS = { batting: 0.45, bowling: 0.45, fielding: 0.1 };

// How much each batting slot contributes to the team's batting strength. The top order does the
// bulk of the scoring, so a specialist bowler parked at No.11 barely moves the batting number.
const BAT_SLOT_WEIGHT = [1.0, 1.0, 1.0, 0.94, 0.86, 0.76, 0.6, 0.42, 0.26, 0.15, 0.08];
const BAT_WEIGHT_TOTAL = BAT_SLOT_WEIGHT.reduce((a, b) => a + b, 0);

const ATTACK_SIZE = 5; // only your front-line attack bowls the 20 overs
const FIELDING_SLOTS = 11; // everyone in the XI fields

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Every team metric is MONOTONIC: drafting a player can only raise a rating, never lower it. Each
 * discipline is a sum of per-player contributions over a FIXED divisor — not an average over the
 * players picked so far. So a mediocre fielder still nudges team fielding UP, just by less than a
 * great fielder would; the rating climbs toward its ceiling as the XI fills out.
 */
export function computeTeamRating(
  slots: DraftSlot[],
  playersById: Map<string, PlayerSeason>
): TeamRatingBreakdown {
  const filled = slots
    .map((s) => ({ slot: s, player: s.playerId ? playersById.get(s.playerId) : undefined }))
    .filter((x): x is { slot: DraftSlot; player: PlayerSeason } => x.player != null);

  if (filled.length === 0) {
    return { batting: 0, bowling: 0, fielding: 0, overall: 0 };
  }

  // Batting: position-weighted, divided by the full-XI weight total. A great opener lifts it far
  // more than a No.10 could, and a tail-end bowler barely registers.
  let batNum = 0;
  for (const { slot, player } of filled) {
    batNum += player.rating.bat * (BAT_SLOT_WEIGHT[slot.index] ?? 0.08);
  }
  const batting = batNum / BAT_WEIGHT_TOTAL;

  // Bowling: your best ATTACK_SIZE bowling ratings over a fixed 5-man divisor (your real attack).
  const bowling = sum(
    filled
      .map((x) => x.player.rating.bowl)
      .sort((a, b) => b - a)
      .slice(0, ATTACK_SIZE)
  ) / ATTACK_SIZE;

  // Fielding: every fielder's rating contributes over a fixed 11-man divisor.
  const fielding = sum(filled.map((x) => x.player.rating.field)) / FIELDING_SLOTS;

  const overall = batting * WEIGHTS.batting + bowling * WEIGHTS.bowling + fielding * WEIGHTS.fielding;

  return { batting, bowling, fielding, overall };
}
