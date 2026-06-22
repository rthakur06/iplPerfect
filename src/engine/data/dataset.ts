import type { PlayerSeason, TeamSeason } from "../types";
import playerSeasonsJson from "./playerSeasons.generated.json";
import teamSeasonsJson from "./teamSeasons.generated.json";

// Cast through unknown: the generated JSON is produced by scripts/assemble-dataset.ts directly
// from these same engine types, but TS can't verify that statically across a JSON import.
export const PLAYER_SEASONS_BY_ID = playerSeasonsJson as unknown as Record<string, PlayerSeason>;
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
