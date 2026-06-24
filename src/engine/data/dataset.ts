import type { PlayerSeason, TeamSeason } from "../types";
import playerSeasonsJson from "./playerSeasons.generated.json";
import teamSeasonsJson from "./teamSeasons.generated.json";

// Cast through unknown: the generated JSON is produced by scripts/assemble-dataset.ts directly
// from these same engine types, but TS can't verify that statically across a JSON import.
const rawPlayerSeasons = playerSeasonsJson as unknown as Record<string, PlayerSeason>;

// A keeper is anyone who kept wicket in ANY season of their career — the generated data only flags
// the keeper for each individual team-season, so propagate that across every season of the same
// real person. (A batter who kept even once is a viable keeper option in any of their seasons.)
const everKept = new Set<string>();
for (const p of Object.values(rawPlayerSeasons)) {
  if (p.isWicketkeeper) everKept.add(p.personId);
}
for (const p of Object.values(rawPlayerSeasons)) {
  if (everKept.has(p.personId)) p.isWicketkeeper = true;
}

export const PLAYER_SEASONS_BY_ID = rawPlayerSeasons;
export const TEAM_SEASONS_BY_ID = teamSeasonsJson as unknown as Record<string, TeamSeason>;

export const ALL_TEAM_SEASONS: TeamSeason[] = Object.values(TEAM_SEASONS_BY_ID);

export function getPlayerSeason(id: string): PlayerSeason | undefined {
  return PLAYER_SEASONS_BY_ID[id];
}

export function playersForTeamSeason(teamSeasonId: string): PlayerSeason[] {
  const teamSeason = TEAM_SEASONS_BY_ID[teamSeasonId];
  if (!teamSeason) return [];
  return teamSeason.playerIds.map((id) => PLAYER_SEASONS_BY_ID[id]).filter((p): p is PlayerSeason => p != null);
}
