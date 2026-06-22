import type { LeagueFinish, TeamSeason } from "./types";
import { franchisesActiveIn, seasonsFor } from "./data/franchises";

/** Prestige multiplier so champions/playoff sides land a bit more than mid-table filler. */
function prestigeMultiplier(finish: LeagueFinish): number {
  switch (finish.result) {
    case "CHAMPION":
      return 1.4;
    case "RUNNER_UP":
      return 1.25;
    case "PLAYOFFS":
      return 1.1;
    case "LEAGUE_STAGE":
      // Bottom-of-table seasons are still spinnable, just slightly less likely.
      return finish.rank >= 8 ? 0.8 : 1.0;
  }
}

export interface WeightedPool {
  teamSeasons: TeamSeason[];
  weights: number[]; // same length, normalized weights (sums to 1)
}

export function buildWeightedPool(teamSeasons: TeamSeason[]): WeightedPool {
  const rawWeights = teamSeasons.map((ts) => prestigeMultiplier(ts.leagueFinish));
  const total = rawWeights.reduce((a, b) => a + b, 0);
  return {
    teamSeasons,
    weights: rawWeights.map((w) => w / total),
  };
}

/** Weighted-random pick using a [0,1) draw from the seeded RNG stream. */
export function spinWheel(pool: WeightedPool, draw: number): TeamSeason {
  let cumulative = 0;
  for (let i = 0; i < pool.teamSeasons.length; i++) {
    cumulative += pool.weights[i];
    if (draw < cumulative) return pool.teamSeasons[i];
  }
  return pool.teamSeasons[pool.teamSeasons.length - 1];
}

/**
 * Team reroll: keep the season, swap the franchise.
 * Pool is every OTHER franchise that validly existed in that same year.
 */
export function rerollTeam(
  current: TeamSeason,
  allTeamSeasons: TeamSeason[],
  draw: number
): TeamSeason {
  const candidateFranchiseIds = franchisesActiveIn(current.season)
    .map((f) => f.id)
    .filter((id) => id !== current.franchiseId);

  const candidates = allTeamSeasons.filter(
    (ts) => ts.season === current.season && candidateFranchiseIds.includes(ts.franchiseId)
  );
  if (candidates.length === 0) return current;
  return spinWheel(buildWeightedPool(candidates), draw);
}

/**
 * Year reroll: keep the franchise, swap the season.
 * Pool is every OTHER season that franchise validly existed in.
 */
export function rerollYear(
  current: TeamSeason,
  allTeamSeasons: TeamSeason[],
  draw: number
): TeamSeason {
  const candidateYears = seasonsFor(current.franchiseId).filter((y) => y !== current.season);
  const candidates = allTeamSeasons.filter(
    (ts) => ts.franchiseId === current.franchiseId && candidateYears.includes(ts.season)
  );
  if (candidates.length === 0) return current;
  return spinWheel(buildWeightedPool(candidates), draw);
}
