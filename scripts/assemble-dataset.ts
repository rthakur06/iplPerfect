// Final pipeline step: merges every prior output (stats, ratings, nationality, keepers,
// league finish) into the actual engine-ready dataset matching src/engine/types.ts exactly.
//
// Two fields have no reliable free data source and are deliberately simplified rather than
// guessed inaccurately:
//   - bowlingRole only distinguishes "bowls at all" from "doesn't" — pace vs spin needs
//     biographical data (bowling arm/style) that's behind ESPNcricinfo, which blocks scraping.
//     Every bowler defaults to PACE; this should be manually corrected for spinners before
//     it's used for anything beyond the MIN_BOWLING_OPTIONS composition check.
//   - roles (TOP/MIDDLE/FINISHER/BOWLER) are derived from each player's real average batting
//     position, which parse-cricsheet.ts now recovers from the order batters first appear in
//     each innings — see deriveRoles() below.
//
// Players/team-seasons left unresolved by earlier steps (nationality, keeper) are still
// included — with a conservative default and a flag in the accompanying manual-review report
// — rather than dropped, so a handful of missing facts don't shrink the playable roster.
//
// Usage:
//   npx tsx scripts/assemble-dataset.ts

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { isValidTeamSeason } from "../src/engine/data/franchises";
import type { PlayerRole, PlayerSeason, TeamSeason, LeagueFinish } from "../src/engine/types";
import { avgBattingPosition, battingAverage, strikeRate, economy, type BattingStats, type BowlingStats } from "./stat-formulas";

const ALLROUNDER_BOWLING_BALLS_FOR_ROLE = 60; // real bowling load -> qualifies for the BOWLER (lower-order) role

/**
 * Eligible batting categories from a player's real average batting position (1 = opener) and
 * bowling load. Bands overlap on purpose, so a hard-hitting No.5 reads as MIDDLE + FINISHER.
 * Every player gets at least one role (a fallback by position) so they're always placeable.
 */
function deriveRoles(avgPos: number, bowlingBalls: number, batInnings: number): PlayerRole[] {
  const roles = new Set<PlayerRole>();
  const batsMeaningfully = batInnings > 0 && avgPos < 90;
  if (batsMeaningfully) {
    if (avgPos < 3.5) roles.add("TOP");
    if (avgPos >= 3.0 && avgPos < 6.5) roles.add("MIDDLE");
    if (avgPos >= 4.5 && avgPos < 8.5) roles.add("FINISHER");
  }
  if (bowlingBalls >= ALLROUNDER_BOWLING_BALLS_FOR_ROLE) roles.add("BOWLER");
  if (roles.size === 0) {
    if (avgPos < 3.5) roles.add("TOP");
    else if (avgPos < 6.5) roles.add("MIDDLE");
    else roles.add("BOWLER");
  }
  return [...roles];
}

const GEN = (file: string) => resolve("data/generated", file);
const OUT_PLAYERS = resolve("src/engine/data/playerSeasons.generated.json");
const OUT_TEAMS = resolve("src/engine/data/teamSeasons.generated.json");
const REVIEW_FILE = resolve("data/generated/manual-review.json");

interface PlayerSeasonAgg {
  name: string;
  personId: string;
  matches: number;
  batting: BattingStats;
  bowling: BowlingStats;
  fielding: { catches: number; stumpings: number };
}
interface TeamSeasonStats {
  franchiseId: string;
  season: number;
  players: PlayerSeasonAgg[];
}
interface RatingEntry {
  personId: string;
  name: string;
  rating: { bat: number; bowl: number; field: number; ovr: number };
  limitedSample: boolean;
}
interface NationalityEntry {
  personId: string;
  isOverseas: boolean;
}
interface KeeperEntry {
  personId: string;
}
interface NationalityOverrideEntry {
  name: string;
  country: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function main(): void {
  const stats = readJson<Record<string, TeamSeasonStats>>(GEN("player-season-stats.json"));
  const ratingsByTeamSeason = readJson<Record<string, { players: RatingEntry[] }>>(GEN("player-ratings.json"));
  const nationalityList = readJson<NationalityEntry[]>(GEN("player-nationality.json"));
  const keepersByTeamSeason = readJson<Record<string, KeeperEntry>>(GEN("team-season-keeper.json"));
  const finishByTeamSeason = readJson<Record<string, LeagueFinish>>(GEN("team-season-finish.json"));
  // Web-search-verified corrections for players Wikidata had no citizenship/national-team claim
  // for at all — almost all genuinely overseas players the automatic resolver missed (the
  // "isOverseas: false" default below is actually correct for the *other* unresolved players,
  // who are overwhelmingly uncapped Indian domestic players).
  const nationalityOverrides = readJson<Record<string, NationalityOverrideEntry>>(
    GEN("manual-nationality-overrides.json")
  );

  const nationalityByPersonId = new Map(nationalityList.map((n) => [n.personId, n.isOverseas]));

  const playerSeasons: Record<string, PlayerSeason> = {};
  const teamSeasons: Record<string, TeamSeason> = {};

  const overseasUnresolved: string[] = [];
  const keeperFallbackUsed: string[] = [];

  for (const [teamSeasonId, ts] of Object.entries(stats)) {
    if (!isValidTeamSeason(ts.franchiseId, ts.season)) {
      console.warn(`Skipping ${teamSeasonId}: not a valid (franchise, season) per franchises.ts`);
      continue;
    }

    const ratings = new Map(
      (ratingsByTeamSeason[teamSeasonId]?.players ?? []).map((p) => [p.personId, p])
    );

    let keeperPersonId = keepersByTeamSeason[teamSeasonId]?.personId ?? null;
    if (!keeperPersonId) {
      // No stumpings recorded all season — fall back to most catches as a working default;
      // flagged below so it can be hand-corrected against the real squad list later.
      const byCatches = [...ts.players].sort((a, b) => b.fielding.catches - a.fielding.catches);
      keeperPersonId = byCatches[0]?.personId ?? null;
      keeperFallbackUsed.push(teamSeasonId);
    }

    const playerIds: string[] = [];

    for (const p of ts.players) {
      const ratingEntry = ratings.get(p.personId);
      if (!ratingEntry) {
        console.warn(`No rating computed for ${p.name} (${p.personId}) in ${teamSeasonId}, skipping`);
        continue;
      }
      const rating = ratingEntry.rating;

      let isOverseas = nationalityByPersonId.get(p.personId);
      if (isOverseas === undefined) {
        const override = nationalityOverrides[p.personId];
        if (override) {
          isOverseas = override.country !== "India";
        } else {
          isOverseas = false; // conservative default: don't accidentally blow the overseas cap
          overseasUnresolved.push(p.personId);
        }
      }

      const avgPos = avgBattingPosition(p.batting);
      const roles = deriveRoles(avgPos, p.bowling.balls, p.batting.innings);

      // personId is a stable Cricsheet identifier for the real person, reused across every
      // season they played — it can't double as PlayerSeason.id, since the same player has a
      // distinct PlayerSeason (distinct rating, distinct team) in every season they appear in.
      const playerSeasonId = `${p.personId}@${teamSeasonId}`;

      const playerSeason: PlayerSeason = {
        id: playerSeasonId,
        personId: p.personId,
        name: p.name,
        teamSeasonId,
        isWicketkeeper: p.personId === keeperPersonId,
        isOverseas,
        roles,
        bowlingRole: p.bowling.balls > 0 ? "PACE" : "NONE", // pace/spin not distinguishable from free data sources, see file header
        rating,
        limitedSample: ratingEntry.limitedSample,
        stats: {
          matches: p.matches,
          battingInnings: p.batting.innings,
          runs: p.batting.runs,
          ballsFaced: p.batting.balls,
          battingAverage: Math.round(battingAverage(p.batting) * 10) / 10,
          strikeRate: Math.round(strikeRate(p.batting) * 10) / 10,
          fours: p.batting.fours,
          sixes: p.batting.sixes,
          oversBowled: Math.round((p.bowling.balls / 6) * 10) / 10,
          wickets: p.bowling.wickets,
          runsConceded: p.bowling.runsConceded,
          economy: Math.round(economy(p.bowling) * 100) / 100,
          catches: p.fielding.catches,
          stumpings: p.fielding.stumpings,
          avgBattingPosition: Math.round(avgPos * 10) / 10,
        },
      };

      playerSeasons[playerSeasonId] = playerSeason;
      playerIds.push(playerSeasonId);
    }

    teamSeasons[teamSeasonId] = {
      id: teamSeasonId,
      franchiseId: ts.franchiseId,
      season: ts.season,
      leagueFinish: finishByTeamSeason[teamSeasonId] ?? { result: "LEAGUE_STAGE", rank: 10 },
      playerIds,
    };
  }

  mkdirSync(resolve("src/engine/data"), { recursive: true });
  writeFileSync(OUT_PLAYERS, JSON.stringify(playerSeasons, null, 2));
  writeFileSync(OUT_TEAMS, JSON.stringify(teamSeasons, null, 2));
  writeFileSync(
    REVIEW_FILE,
    JSON.stringify({ overseasUnresolved, keeperFallbackUsed }, null, 2)
  );

  console.log(`${Object.keys(playerSeasons).length} player-seasons -> ${OUT_PLAYERS}`);
  console.log(`${Object.keys(teamSeasons).length} team-seasons -> ${OUT_TEAMS}`);
  console.log(
    `Manual review needed: ${overseasUnresolved.length} overseas-unresolved player-seasons, ${keeperFallbackUsed.length} keeper-fallback team-seasons -> ${REVIEW_FILE}`
  );
}

main();
