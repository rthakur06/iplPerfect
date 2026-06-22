import type { MatchResult, PlayoffMatchResult, PlayoffStage, SeasonResult, TeamRatingBreakdown } from "./types";
import { createRng, samplePoisson } from "./rng";
import { BOSS_FINAL, BOSS_QUALIFIER, BOSS_SEMI_FINAL, TEAM_STRENGTHS, type TeamStrength } from "./teamStrength";

const OVERS_PER_INNINGS = 20;
const DOUBLE_ROUND_OPPONENTS = 5; // play 5 of them twice, 4 once -> 14 league games

/** Nine real team-seasons, drawn at random from the whole of IPL history, as your league field. */
function generateLeagueOpponents(rng: () => number): TeamStrength[] {
  const picked: TeamStrength[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (picked.length < 9 && guard++ < 500) {
    const t = TEAM_STRENGTHS[Math.floor(rng() * TEAM_STRENGTHS.length)];
    if (used.has(t.teamSeasonId)) continue;
    used.add(t.teamSeasonId);
    picked.push(t);
  }
  return picked;
}

function buildSchedule(opponents: TeamStrength[], rng: () => number): { opponent: TeamStrength; isHome: boolean }[] {
  const shuffled = [...opponents].sort(() => rng() - 0.5);
  const doubleOpponents = shuffled.slice(0, DOUBLE_ROUND_OPPONENTS);
  const singleOpponents = shuffled.slice(DOUBLE_ROUND_OPPONENTS);

  const fixtures: { opponent: TeamStrength; isHome: boolean }[] = [];
  doubleOpponents.forEach((o) => {
    fixtures.push({ opponent: o, isHome: true });
    fixtures.push({ opponent: o, isHome: false });
  });
  singleOpponents.forEach((o, i) => {
    fixtures.push({ opponent: o, isHome: i % 2 === 0 });
  });
  return fixtures;
}

interface InningsResult {
  runs: number;
  wickets: number;
  overs: number;
}

const HOME_BOOST = 2;

/** Simulate one innings over-by-over. If `target` is set, stops once chased (2nd innings). */
function simulateInnings(
  battingStrength: number,
  bowlingStrength: number,
  rng: () => number,
  target?: number
): InningsResult {
  let runs = 0;
  let wickets = 0;
  let oversBowled = 0;

  for (let over = 0; over < OVERS_PER_INNINGS; over++) {
    if (wickets >= 10) break;
    if (target != null && runs >= target) break;

    const diff = battingStrength - bowlingStrength;
    const lambda = Math.max(2, 7.5 + diff * 0.12); // expected runs this over
    let runsThisOver = samplePoisson(rng, lambda);

    const wicketProb = clamp(0.18 - diff * 0.003, 0.04, 0.5);
    if (rng() < wicketProb) {
      wickets++;
      runsThisOver = Math.max(0, runsThisOver - 2);
    }

    if (target != null && runs + runsThisOver >= target) {
      runs = target;
      oversBowled = over + 1;
      break;
    }

    runs += runsThisOver;
    oversBowled = over + 1;
  }

  return { runs, wickets: Math.min(wickets, 10), overs: oversBowled };
}

function simulateMatch(
  yourRating: TeamRatingBreakdown,
  opponent: TeamStrength,
  isHome: boolean,
  rng: () => number
): MatchResult {
  const yourBat = yourRating.batting + (isHome ? HOME_BOOST : 0);
  const yourBowl = yourRating.bowling + (isHome ? HOME_BOOST : 0);
  const theirBat = opponent.batting + (isHome ? 0 : HOME_BOOST);
  const theirBowl = opponent.bowling + (isHome ? 0 : HOME_BOOST);

  const yourTeamBatsFirst = rng() < 0.5;

  let yourScore: InningsResult;
  let theirScore: InningsResult;

  if (yourTeamBatsFirst) {
    yourScore = simulateInnings(yourBat, theirBowl, rng);
    theirScore = simulateInnings(theirBat, yourBowl, rng, yourScore.runs + 1);
  } else {
    theirScore = simulateInnings(theirBat, yourBowl, rng);
    yourScore = simulateInnings(yourBat, theirBowl, rng, theirScore.runs + 1);
  }

  const tied = yourScore.runs === theirScore.runs;
  const won = !tied && yourScore.runs > theirScore.runs;

  return {
    opponentFranchiseId: opponent.franchiseId,
    opponentName: opponent.name,
    opponentSeason: opponent.season,
    isHome,
    yourScore,
    theirScore,
    won,
    tied,
  };
}

interface TableRow {
  franchiseId: string; // "YOU" or opponent id
  points: number;
  netRunRate: number;
}

function pointsFor(result: MatchResult): number {
  if (result.tied) return 1;
  return result.won ? 2 : 0;
}

function approximateNrr(result: MatchResult): number {
  const yourRr = result.yourScore.overs > 0 ? result.yourScore.runs / result.yourScore.overs : 0;
  const theirRr = result.theirScore.overs > 0 ? result.theirScore.runs / result.theirScore.overs : 0;
  return yourRr - theirRr;
}

/** Full deterministic season: 14-game league stage + an escalating 3-match playoff gauntlet. */
export function simulateSeason(seedKey: string, yourRating: TeamRatingBreakdown): SeasonResult {
  const seed = hashSeed(seedKey);
  const rng = createRng(seed);

  const opponents = generateLeagueOpponents(rng);
  const schedule = buildSchedule(opponents, rng);

  const leagueStage = schedule.map((fixture) =>
    simulateMatch(yourRating, fixture.opponent, fixture.isHome, rng)
  );

  const yourRow: TableRow = { franchiseId: "YOU", points: 0, netRunRate: 0 };
  leagueStage.forEach((m) => {
    yourRow.points += pointsFor(m);
    yourRow.netRunRate += approximateNrr(m);
  });

  // Other nine teams take table places ranked by real playing strength (deterministic, no need to
  // sim their full seasons) — stronger sides bank more points.
  const table: TableRow[] = [yourRow];
  [...opponents]
    .sort((a, b) => b.overall - a.overall)
    .forEach((o, i) => {
      table.push({ franchiseId: o.teamSeasonId, points: 24 - i * 2, netRunRate: 4 - i * 0.4 });
    });

  table.sort((a, b) => b.points - a.points || b.netRunRate - a.netRunRate);
  const finalRank = table.findIndex((r) => r.franchiseId === "YOU") + 1;
  const madePlayoffs = finalRank <= 4;
  const unbeatenLeagueStage = leagueStage.every((m) => m.won);
  const loseEverySingleGame = leagueStage.every((m) => !m.won && !m.tied);

  // Playoff gauntlet: a strong side, then a stronger side, then the best team ever assembled.
  const playoffStage: PlayoffMatchResult[] = [];
  let wonTitle = false;

  if (madePlayoffs) {
    const gauntlet: { stage: PlayoffStage; opp: TeamStrength }[] = [
      { stage: "QUALIFIER", opp: BOSS_QUALIFIER },
      { stage: "SEMI_FINAL", opp: BOSS_SEMI_FINAL },
      { stage: "FINAL", opp: BOSS_FINAL },
    ];
    for (const { stage, opp } of gauntlet) {
      const m = simulateMatch(yourRating, opp, false, rng);
      playoffStage.push({ ...m, stage });
      if (!m.won) break; // knocked out
      if (stage === "FINAL") wonTitle = true;
    }
  }

  const perfectSeason = unbeatenLeagueStage && wonTitle;

  return {
    seed: seedKey,
    leagueStage,
    madePlayoffs,
    playoffStage,
    wonTitle,
    unbeatenLeagueStage,
    perfectSeason,
    loseEverySingleGame,
    points: yourRow.points,
    netRunRate: yourRow.netRunRate,
    finalRank,
  };
}

function hashSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return h >>> 0;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
