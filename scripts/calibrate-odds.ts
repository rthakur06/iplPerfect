// Calibrates odds.ts's thresholds against the real achievable range of team Overall, now that
// we have the actual dataset. Two numbers matter:
//   - "ceiling": the single best XI achievable across the ENTIRE dataset (not one squad — the
//     real game lets you draft the best player from up to 11 different team-season spins), used
//     to anchor TITLE_THRESHOLD near the top of what's actually possible.
//   - "random-run distribution": many simulated "spin 11 times, draft the best eligible player
//     each time" runs, approximating what an average/lucky/unlucky player actually ends up with.
//     LEAGUE_AVG_OVERALL should sit at this distribution's median, not at an arbitrary guess.
//
// Usage:
//   npx tsx scripts/calibrate-odds.ts

import { createRng } from "../src/engine/rng";
import { computeTeamRating } from "../src/engine/rating";
import { ALL_TEAM_SEASONS, PLAYER_SEASONS_BY_ID } from "../src/engine/data/dataset";
import { MAX_OVERSEAS, XI_SIZE } from "../src/engine/rules";
import type { DraftSlot, PlayerSeason, TeamRatingBreakdown } from "../src/engine/types";

const NUM_TRIALS = 2000;

function buildSlots(playerIds: (string | null)[]): DraftSlot[] {
  return playerIds.map((id, i) => ({ index: i, playerId: id }));
}

/** One simulated run: 11 random team-season spins, drafting the best still-eligible player each time. */
function simulateRandomDraft(rng: () => number): TeamRatingBreakdown {
  const playerIds: (string | null)[] = [];
  const usedPlayerIds = new Set<string>();
  let overseasCount = 0;

  for (let pick = 0; pick < XI_SIZE; pick++) {
    const teamSeason = ALL_TEAM_SEASONS[Math.floor(rng() * ALL_TEAM_SEASONS.length)];
    const candidates = teamSeason.playerIds
      .map((id) => PLAYER_SEASONS_BY_ID[id])
      .filter((p): p is PlayerSeason => p != null && !usedPlayerIds.has(p.id))
      .sort((a, b) => b.rating.ovr - a.rating.ovr);

    const best = candidates.find((p) => !p.isOverseas || overseasCount < MAX_OVERSEAS);
    if (!best) continue; // this spin's squad has nothing eligible left, skip the pick

    playerIds.push(best.id);
    usedPlayerIds.add(best.id);
    if (best.isOverseas) overseasCount++;
  }

  const slots = buildSlots(playerIds);
  const playersById = new Map(playerIds.filter((id): id is string => id != null).map((id) => [id, PLAYER_SEASONS_BY_ID[id]]));
  return computeTeamRating(slots, playersById);
}

/** The theoretical ceiling: best possible XI across the whole dataset, ignoring the "11 separate spins" constraint. */
function computeCeiling(): TeamRatingBreakdown {
  const allPlayers = Object.values(PLAYER_SEASONS_BY_ID).sort((a, b) => b.rating.ovr - a.rating.ovr);
  const picked: PlayerSeason[] = [];
  let overseasCount = 0;

  for (const p of allPlayers) {
    if (picked.length >= XI_SIZE) break;
    if (p.isOverseas && overseasCount >= MAX_OVERSEAS) continue;
    picked.push(p);
    if (p.isOverseas) overseasCount++;
  }

  const slots = buildSlots(picked.map((p) => p.id));
  const playersById = new Map(picked.map((p) => [p.id, p]));
  return computeTeamRating(slots, playersById);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

function main(): void {
  const rng = createRng(42);
  const trials: TeamRatingBreakdown[] = [];
  for (let i = 0; i < NUM_TRIALS; i++) {
    trials.push(simulateRandomDraft(rng));
  }

  const ceiling = computeCeiling();

  for (const key of ["batting", "bowling", "fielding", "overall"] as const) {
    const values = trials.map((t) => t[key]).sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    console.log(
      `${key}: p10=${percentile(values, 0.1).toFixed(1)}  p50=${percentile(values, 0.5).toFixed(1)}  p90=${percentile(values, 0.9).toFixed(1)}  mean=${mean.toFixed(1)}  ceiling=${ceiling[key].toFixed(1)}`
    );
  }
}

main();
