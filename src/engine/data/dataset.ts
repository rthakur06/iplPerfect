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

// The data pipeline can't tell pace from spin (it needs bowling-style data that isn't in the free
// sources), so it defaults every bowler to PACE. Re-label the well-known spinners here so the
// pace/spin matchup matters when drafting. (Curated set; matched on the dataset's name format.)
const SPINNERS = new Set([
  "A Kumble", "A Mishra", "A Zampa", "AR Patel", "AU Rashid", "BAW Mendis", "CV Varun", "DL Vettori",
  "GB Hogg", "Harbhajan Singh", "Imran Tahir", "Iqbal Abdulla", "IS Sodhi", "J Yadav", "Jalaj S Saxena",
  "K Kartikeya", "KA Maharaj", "KH Pandya", "Kuldeep Yadav", "KV Sharma", "M Ashwin", "M Kartik",
  "M Markande", "M Muralitharan", "M Theekshana", "MJ Santner", "MM Ali", "Mohammad Hafeez",
  "Mohammad Nabi", "Mujeeb Ur Rahman", "Noor Ahmad", "P Negi", "PP Chawla", "PP Ojha", "PV Tambe",
  "R Ashwin", "R Sai Kishore", "R Tewatia", "RA Jadeja", "Rashid Khan", "Ravi Bishnoi", "RR Powar",
  "S Badree", "S Nadeem", "Shahbaz Ahmed", "Shakib Al Hasan", "SP Narine", "T Shamsi", "Washington Sundar",
  "YS Chahal",
]);
for (const p of Object.values(rawPlayerSeasons)) {
  if (p.bowlingRole === "PACE" && SPINNERS.has(p.name)) p.bowlingRole = "SPIN";
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
