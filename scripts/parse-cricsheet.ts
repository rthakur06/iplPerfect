// Aggregates raw Cricsheet IPL match JSON into per-team-season player stats.
//
// Usage:
//   npx tsx scripts/parse-cricsheet.ts [inputDir] [outputFile]
//
// inputDir defaults to data/cricsheet/ipl_json — download ipl_json.zip from
// https://cricsheet.org/downloads/ and extract its *.json match files there.
//
// This does NOT compute the final 0-99 ratings — it just rolls raw stats up to
// player-season granularity. The rating formula is a separate step once we've
// agreed on it.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CricsheetMatch } from "./cricsheet-types";
import { franchiseIdForTeamName } from "./team-aliases";

const inputDir = resolve(process.argv[2] ?? "data/cricsheet/ipl_json");
const outputFile = resolve(process.argv[3] ?? "data/generated/player-season-stats.json");

interface BattingStats {
  innings: number;
  runs: number;
  balls: number;
  dismissals: number;
  fours: number;
  sixes: number;
  positionSum: number; // sum of batting-order positions (1=opener) across innings; avg = positionSum/innings
}

interface BowlingStats {
  balls: number; // includes illegal deliveries (wides/no-balls) — small approximation, see README note below
  runsConceded: number;
  wickets: number;
}

interface FieldingStats {
  catches: number;
  stumpings: number;
}

interface PlayerSeasonAgg {
  name: string;
  personId: string;
  matches: number;
  batting: BattingStats;
  bowling: BowlingStats;
  fielding: FieldingStats;
}

type TeamSeasonAgg = Record<string, PlayerSeasonAgg>; // keyed by personId

const NO_BOWLER_CREDIT_DISMISSALS = new Set(["run out", "retired hurt", "retired out", "obstructing the field"]);

function emptyPlayerAgg(name: string, personId: string): PlayerSeasonAgg {
  return {
    name,
    personId,
    matches: 0,
    batting: { innings: 0, runs: 0, balls: 0, dismissals: 0, fours: 0, sixes: 0, positionSum: 0 },
    bowling: { balls: 0, runsConceded: 0, wickets: 0 },
    fielding: { catches: 0, stumpings: 0 },
  };
}

function seasonYearFromMatch(match: CricsheetMatch): number {
  // IPL editions never cross a calendar year boundary, so the first match date's
  // year is always the correct season — simpler and more reliable than parsing
  // the inconsistent `info.season` field (sometimes "2007/08", sometimes a number).
  return new Date(match.info.dates[0]).getFullYear();
}

function getOrCreatePlayer(
  teamAgg: TeamSeasonAgg,
  name: string,
  registry: Record<string, string>
): PlayerSeasonAgg {
  const personId = registry[name];
  if (!personId) {
    throw new Error(`No registry id for player "${name}" — Cricsheet registry should always have one.`);
  }
  if (!teamAgg[personId]) {
    teamAgg[personId] = emptyPlayerAgg(name, personId);
  }
  return teamAgg[personId];
}

function processMatch(match: CricsheetMatch, bySeasonTeam: Map<string, TeamSeasonAgg>): void {
  const season = seasonYearFromMatch(match);
  const registry = match.info.registry.people;

  const teamAggForName = (teamName: string): TeamSeasonAgg => {
    const franchiseId = franchiseIdForTeamName(teamName);
    const key = `${franchiseId}-${season}`;
    if (!bySeasonTeam.has(key)) bySeasonTeam.set(key, {});
    return bySeasonTeam.get(key)!;
  };

  // Count one "match played" per player who actually appeared in the squad list for this match.
  for (const teamName of match.info.teams) {
    const teamAgg = teamAggForName(teamName);
    for (const playerName of match.info.players[teamName] ?? []) {
      getOrCreatePlayer(teamAgg, playerName, registry).matches++;
    }
  }

  // Ball-by-ball aggregation. We don't know each delivery's bowling team directly,
  // so derive it as "whichever of the two teams isn't innings.team".
  const [teamA, teamB] = match.info.teams;

  for (const innings of match.innings) {
    const battingTeamName = innings.team;
    const bowlingTeamName = battingTeamName === teamA ? teamB : teamA;
    const battingAgg = teamAggForName(battingTeamName);
    const bowlingAgg = teamAggForName(bowlingTeamName);

    const battingOrderSeen = new Set<string>();

    for (const over of innings.overs) {
      for (const delivery of over.deliveries) {
        const isWide = (delivery.extras?.wides ?? 0) > 0;
        const byesAndLegbyes = (delivery.extras?.byes ?? 0) + (delivery.extras?.legbyes ?? 0);

        const batter = getOrCreatePlayer(battingAgg, delivery.batter, registry);
        if (!battingOrderSeen.has(delivery.batter)) {
          batter.batting.innings++;
          // First appearance order in the innings == batting-order position (1 = opener).
          batter.batting.positionSum += battingOrderSeen.size + 1;
          battingOrderSeen.add(delivery.batter);
        }
        if (!isWide) {
          batter.batting.balls++;
          batter.batting.runs += delivery.runs.batter;
          if (delivery.runs.batter === 4) batter.batting.fours++;
          if (delivery.runs.batter === 6) batter.batting.sixes++;
        }

        const bowler = getOrCreatePlayer(bowlingAgg, delivery.bowler, registry);
        bowler.bowling.balls++; // approximation: includes wides/no-balls, see scripts README note
        bowler.bowling.runsConceded += delivery.runs.total - byesAndLegbyes;

        for (const wicket of delivery.wickets ?? []) {
          const dismissedPlayer = getOrCreatePlayer(battingAgg, wicket.player_out, registry);
          dismissedPlayer.batting.dismissals++;

          if (!NO_BOWLER_CREDIT_DISMISSALS.has(wicket.kind)) {
            bowler.bowling.wickets++;
          }

          for (const fielder of wicket.fielders ?? []) {
            if (!fielder.name || !registry[fielder.name]) continue;
            const fieldingPlayer = getOrCreatePlayer(bowlingAgg, fielder.name, registry);
            if (wicket.kind === "stumped") fieldingPlayer.fielding.stumpings++;
            else if (wicket.kind === "caught") fieldingPlayer.fielding.catches++;
          }
        }
      }
    }
  }
}

function main(): void {
  const files = readdirSync(inputDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error(`No .json files found in ${inputDir}. Download+extract ipl_json.zip from cricsheet.org first.`);
    process.exit(1);
  }

  const bySeasonTeam = new Map<string, TeamSeasonAgg>();

  let processed = 0;
  for (const file of files) {
    const raw = readFileSync(join(inputDir, file), "utf-8");
    const match: CricsheetMatch = JSON.parse(raw);
    try {
      processMatch(match, bySeasonTeam);
      processed++;
    } catch (err) {
      console.warn(`Skipped ${file}: ${(err as Error).message}`);
    }
  }

  const output: Record<string, { franchiseId: string; season: number; players: PlayerSeasonAgg[] }> = {};
  for (const [teamSeasonId, agg] of bySeasonTeam) {
    const [franchiseId, seasonStr] = teamSeasonId.split("-");
    output[teamSeasonId] = {
      franchiseId,
      season: Number(seasonStr),
      players: Object.values(agg).sort((a, b) => b.matches - a.matches),
    };
  }

  mkdirSync(resolve("data/generated"), { recursive: true });
  writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`Processed ${processed}/${files.length} matches -> ${Object.keys(output).length} team-seasons -> ${outputFile}`);
}

main();
