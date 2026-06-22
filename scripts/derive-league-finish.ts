// Derives each team-season's real-world LeagueFinish (champion/runner-up/playoffs/league-stage
// rank) straight from Cricsheet match outcomes — used to weight the wheel toward more
// prestigious squads (src/engine/wheel.ts's prestigeMultiplier).
//
// Cricsheet tags playoff matches with info.stage ("Final", "Qualifier 1", "Qualifier 2",
// "Eliminator", "Semi Final", "Elimination Final", "3rd Place Play-Off"); matches with no
// `stage` field are regular league-stage fixtures, from which we reconstruct each season's
// points table to rank the non-playoff teams.
//
// Usage:
//   npx tsx scripts/derive-league-finish.ts [inputDir] [outputFile]

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CricsheetMatch } from "./cricsheet-types";
import { franchiseIdForTeamName } from "./team-aliases";

const inputDir = resolve(process.argv[2] ?? "data/cricsheet/ipl_json");
const outputFile = resolve(process.argv[3] ?? "data/generated/team-season-finish.json");

interface ParsedMatch {
  season: number;
  teamA: string; // franchiseId
  teamB: string;
  winner: string | null; // franchiseId, or null for true tie/no-result
  isTie: boolean;
  stage: string | null; // null = regular league-stage fixture
}

function seasonYearFromMatch(match: CricsheetMatch): number {
  return new Date(match.info.dates[0]).getFullYear();
}

function parseMatch(match: CricsheetMatch): ParsedMatch {
  const season = seasonYearFromMatch(match);
  const [teamAName, teamBName] = match.info.teams;
  const teamA = franchiseIdForTeamName(teamAName);
  const teamB = franchiseIdForTeamName(teamBName);
  const outcome = match.info.outcome as { winner?: string; result?: string } | undefined;

  const winnerName = outcome?.winner;
  const winner = winnerName ? franchiseIdForTeamName(winnerName) : null;
  const isTie = !winner; // covers both "tie" (no super over decision recorded) and "no result"

  return { season, teamA, teamB, winner, isTie, stage: match.info.event.stage ?? null };
}

interface TableRow {
  franchiseId: string;
  points: number;
  wins: number;
  losses: number;
  netRunRateProxy: number; // wins minus losses, used only as a simple tiebreaker (real NRR needs run-rate detail per match)
}

type LeagueFinish =
  | { result: "CHAMPION" }
  | { result: "RUNNER_UP" }
  | { result: "PLAYOFFS"; rank: number }
  | { result: "LEAGUE_STAGE"; rank: number };

function rankLeagueStageTeams(leagueMatches: ParsedMatch[], allFranchiseIds: Set<string>): TableRow[] {
  const table = new Map<string, TableRow>();
  for (const id of allFranchiseIds) {
    table.set(id, { franchiseId: id, points: 0, wins: 0, losses: 0, netRunRateProxy: 0 });
  }

  for (const m of leagueMatches) {
    const rowA = table.get(m.teamA)!;
    const rowB = table.get(m.teamB)!;
    if (m.isTie) {
      rowA.points += 1;
      rowB.points += 1;
    } else if (m.winner === m.teamA) {
      rowA.points += 2;
      rowA.wins++;
      rowB.losses++;
      rowA.netRunRateProxy += 1;
      rowB.netRunRateProxy -= 1;
    } else {
      rowB.points += 2;
      rowB.wins++;
      rowA.losses++;
      rowB.netRunRateProxy += 1;
      rowA.netRunRateProxy -= 1;
    }
  }

  return Array.from(table.values()).sort(
    (a, b) => b.points - a.points || b.netRunRateProxy - a.netRunRateProxy
  );
}

function deriveSeasonFinishes(matches: ParsedMatch[]): Map<string, LeagueFinish> {
  const leagueMatches = matches.filter((m) => m.stage == null);
  const playoffMatches = matches.filter((m) => m.stage != null);

  const allFranchiseIds = new Set<string>();
  for (const m of matches) {
    allFranchiseIds.add(m.teamA);
    allFranchiseIds.add(m.teamB);
  }

  const table = rankLeagueStageTeams(leagueMatches, allFranchiseIds);
  const finishes = new Map<string, LeagueFinish>();

  const finalMatch = playoffMatches.find((m) => m.stage === "Final");
  const champion = finalMatch?.winner ?? null;
  const runnerUp = finalMatch
    ? finalMatch.winner === finalMatch.teamA
      ? finalMatch.teamB
      : finalMatch.teamA
    : null;

  if (champion) finishes.set(champion, { result: "CHAMPION" });
  if (runnerUp) finishes.set(runnerUp, { result: "RUNNER_UP" });

  // Every other team that appeared in any playoff stage but isn't champion/runner-up made the
  // playoffs without winning the title — rank them by table position as a simple, defensible
  // tiebreaker (exact bracket elimination order varies too much across IPL's format changes
  // over the years to model precisely, and it's only a prestige-weighting input, not a hard fact).
  const playoffFranchiseIds = new Set<string>();
  for (const m of playoffMatches) {
    playoffFranchiseIds.add(m.teamA);
    playoffFranchiseIds.add(m.teamB);
  }

  let playoffRank = 3;
  for (const row of table) {
    if (finishes.has(row.franchiseId)) continue;
    if (playoffFranchiseIds.has(row.franchiseId)) {
      finishes.set(row.franchiseId, { result: "PLAYOFFS", rank: playoffRank });
      playoffRank++;
    }
  }

  let leagueRank = playoffRank;
  for (const row of table) {
    if (finishes.has(row.franchiseId)) continue;
    finishes.set(row.franchiseId, { result: "LEAGUE_STAGE", rank: leagueRank });
    leagueRank++;
  }

  return finishes;
}

function main(): void {
  const files = readdirSync(inputDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error(`No .json files found in ${inputDir}.`);
    process.exit(1);
  }

  const bySeasons = new Map<number, ParsedMatch[]>();
  let processed = 0;

  for (const file of files) {
    const raw = readFileSync(join(inputDir, file), "utf-8");
    const match: CricsheetMatch = JSON.parse(raw);
    try {
      const parsed = parseMatch(match);
      if (!bySeasons.has(parsed.season)) bySeasons.set(parsed.season, []);
      bySeasons.get(parsed.season)!.push(parsed);
      processed++;
    } catch (err) {
      console.warn(`Skipped ${file}: ${(err as Error).message}`);
    }
  }

  const output: Record<string, LeagueFinish> = {};
  for (const [season, matches] of bySeasons) {
    const finishes = deriveSeasonFinishes(matches);
    for (const [franchiseId, finish] of finishes) {
      output[`${franchiseId}-${season}`] = finish;
    }
  }

  mkdirSync(resolve("data/generated"), { recursive: true });
  writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`Processed ${processed}/${files.length} matches across ${bySeasons.size} seasons -> ${Object.keys(output).length} team-seasons -> ${outputFile}`);
}

main();
