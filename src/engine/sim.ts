import type {
  BatterLine,
  MatchResult,
  PlayoffMatchResult,
  PlayoffStage,
  SeasonResult,
  SimPlayerStat,
  SimRosterPlayer,
  TeamRatingBreakdown,
} from "./types";
import { createRng, samplePoisson } from "./rng";
import { BOSS_FINAL, BOSS_QUALIFIER, BOSS_SEMI_FINAL, TEAM_STRENGTHS, type TeamStrength } from "./teamStrength";

const OVERS_PER_INNINGS = 20;
const LEAGUE_GAMES = 14;

/** 14 DISTINCT real team-seasons as your league field — one game each, no home-and-away repeats.
 *  Sampling is weighted hard toward the strongest sides in history, so a clean sweep is a real test:
 *  only a genuinely elite XI beats fourteen different quality teams without slipping up once. */
function generateLeagueOpponents(rng: () => number): TeamStrength[] {
  const remaining = [...TEAM_STRENGTHS];
  const picked: TeamStrength[] = [];
  const strengthWeight = (t: TeamStrength) => Math.pow(Math.max(1, t.overall - 40), 4);
  while (picked.length < LEAGUE_GAMES && remaining.length > 0) {
    const total = remaining.reduce((s, t) => s + strengthWeight(t), 0);
    let draw = rng() * total;
    let idx = 0;
    for (; idx < remaining.length - 1; idx++) {
      draw -= strengthWeight(remaining[idx]);
      if (draw <= 0) break;
    }
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked;
}

/** One fixture per opponent, alternating home and away. */
function buildSchedule(opponents: TeamStrength[], rng: () => number): { opponent: TeamStrength; isHome: boolean }[] {
  return [...opponents].sort(() => rng() - 0.5).map((opponent, i) => ({ opponent, isHome: i % 2 === 0 }));
}

interface InningsResult {
  runs: number;
  wickets: number;
  overs: number;
}

const HOME_BOOST = 2;
// In the playoff gauntlet your drafted XI raises its game against the all-time sides — a flat lift
// to the constructed team's batting and bowling that makes the title a real, winnable prize rather
// than a near-impossible wall. Only applied in the gauntlet, so the league stage (and the playoff /
// unbeaten projections) stay an honest test.
const PLAYOFF_TEAM_BOOST = 9;

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

    // Rating gap nudges run-rate and wicket chance, but only modestly — T20 is high-variance, so a
    // small edge is far from a guaranteed win. Only a side that out-rates the field by a wide margin
    // wins consistently enough to go unbeaten across 14 different quality opponents.
    const diff = battingStrength - bowlingStrength;
    const lambda = Math.max(2, 7.5 + diff * 0.06); // expected runs this over
    let runsThisOver = samplePoisson(rng, lambda);

    const wicketProb = clamp(0.2 - diff * 0.0015, 0.06, 0.45);
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
  rng: () => number,
  teamBoost = 0
): MatchResult {
  const yourBat = yourRating.batting + (isHome ? HOME_BOOST : 0) + teamBoost;
  const yourBowl = yourRating.bowling + (isHome ? HOME_BOOST : 0) + teamBoost;
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
    youBattedFirst: yourTeamBatsFirst,
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

const BAT_SLOT_WEIGHT = [1.0, 1.0, 1.0, 0.94, 0.86, 0.76, 0.6, 0.42, 0.26, 0.15, 0.08];

/**
 * Attribute the season's team totals to individual players. Runs/balls go to the batting order
 * (top order faces more; better bats score faster -> higher SR), wickets/overs to the bowlers
 * (better bowlers bowl more and concede less -> lower economy), catches to the fielders. Uses its
 * own RNG stream so it never disturbs the match results computed above.
 */
function attributeStats(
  roster: SimRosterPlayer[],
  allMatches: MatchResult[],
  seed: number
): SimPlayerStat[] {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const teamRuns = allMatches.reduce((s, m) => s + m.yourScore.runs, 0);
  const teamBalls = Math.max(1, allMatches.reduce((s, m) => s + m.yourScore.overs * 6, 0));
  const wicketsTaken = allMatches.reduce((s, m) => s + m.theirScore.wickets, 0);
  const oversBowled = Math.max(1, allMatches.reduce((s, m) => s + m.theirScore.overs, 0));
  const runsConceded = allMatches.reduce((s, m) => s + m.theirScore.runs, 0);
  const catchesTotal = Math.round(wicketsTaken * 0.55); // ~half of dismissals are caught

  const noise = () => 0.75 + rng() * 0.5; // 0.75–1.25 per-player variation

  // ── Batting ──
  const ballShare = roster.map((p) => (BAT_SLOT_WEIGHT[p.slotIndex] ?? 0.08) * noise());
  const ballTot = ballShare.reduce((a, b) => a + b, 0) || 1;
  // Runs also scale by batting skill, so better players post higher strike rates.
  const runShare = roster.map((p, i) => ballShare[i] * (0.55 + p.bat / 100));
  const runTot = runShare.reduce((a, b) => a + b, 0) || 1;

  // ── Bowling (only real bowlers) ──
  const bowlW = roster.map((p) => (p.bowls ? Math.max(0.2, p.bowl / 50) * noise() : 0));
  const bowlTot = bowlW.reduce((a, b) => a + b, 0) || 1;

  // ── Fielding ──
  const fieldW = roster.map((p) => Math.max(0.3, p.field / 50) * noise());
  const fieldTot = fieldW.reduce((a, b) => a + b, 0) || 1;

  return roster.map((p, i) => {
    const ballsFaced = Math.round((teamBalls * ballShare[i]) / ballTot);
    const runs = Math.round((teamRuns * runShare[i]) / runTot);
    const overs = Math.round((oversBowled * bowlW[i]) / bowlTot);
    const wickets = Math.round((wicketsTaken * bowlW[i]) / bowlTot);
    // Better bowlers concede a little less per over than the team average.
    const concededShare = p.bowls ? (bowlW[i] / bowlTot) * (1.05 - p.bowl / 200) : 0;
    const conceded = Math.round(runsConceded * concededShare);
    // Sixes scale with both run volume and hitting power — a destructive bat clears the rope on a
    // bigger share of their runs than an accumulator does.
    const sixes = Math.round((runs / 18) * (0.7 + p.bat / 130));
    return {
      playerId: p.id,
      name: p.name,
      runs,
      ballsFaced,
      strikeRate: ballsFaced > 0 ? Math.round((runs / ballsFaced) * 1000) / 10 : 0,
      sixes,
      wickets,
      oversBowled: overs,
      economy: overs > 0 ? Math.round((conceded / overs) * 100) / 100 : 0,
      catches: Math.round((catchesTotal * fieldW[i]) / fieldTot),
    };
  });
}

/**
 * Break a single innings (your XI's) into a batter-by-batter scorecard, in batting order. Top-order
 * batters face more deliveries; better batters convert more of them into runs. The batters dismissed
 * are the top of the order; the last pair are left not out. Totals reconcile to the innings score.
 */
function buildBattingCard(
  roster: SimRosterPlayer[],
  innings: { runs: number; wickets: number; overs: number },
  rng: () => number
): BatterLine[] {
  const order = [...roster].sort((a, b) => a.slotIndex - b.slotIndex);
  if (order.length === 0) return [];
  const wickets = Math.min(innings.wickets, 10);
  // Batters who came to the crease: those dismissed plus the not-out pair still in at the end.
  const batted = Math.min(order.length, wickets >= 10 ? order.length : wickets + 2);
  const lineup = order.slice(0, batted);

  const noise = () => 0.7 + rng() * 0.6;
  const ballW = lineup.map((p) => Math.max(0.1, BAT_SLOT_WEIGHT[p.slotIndex] ?? 0.08) * noise());
  const ballTot = ballW.reduce((a, b) => a + b, 0) || 1;
  const runW = lineup.map((p, i) => ballW[i] * (0.5 + p.bat / 100));
  const runTot = runW.reduce((a, b) => a + b, 0) || 1;

  const totalBalls = Math.max(lineup.length, Math.round(innings.overs * 6));

  const lines: BatterLine[] = lineup.map((p, i) => ({
    name: p.name,
    balls: Math.max(1, Math.round((totalBalls * ballW[i]) / ballTot)),
    runs: Math.max(0, Math.round((innings.runs * runW[i]) / runTot)),
    out: i < wickets, // the top `wickets` of the order are dismissed; the rest remain not out
  }));

  // Reconcile rounding so the card sums to the real innings total.
  const drift = innings.runs - lines.reduce((s, l) => s + l.runs, 0);
  if (drift !== 0 && lines.length > 0) {
    const top = lines.reduce((best, l) => (l.runs > best.runs ? l : best), lines[0]);
    top.runs = Math.max(0, top.runs + drift);
  }
  return lines;
}

/** Full deterministic season: 14-game league stage + an escalating 3-match playoff gauntlet. */
export function simulateSeason(
  seedKey: string,
  yourRating: TeamRatingBreakdown,
  roster: SimRosterPlayer[] = []
): SeasonResult {
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
  // Other 14 teams take table places by real strength (stronger sides bank more points). The top of
  // the table is deliberately dense and high so finishing 1st — and even making the top 4 — takes a
  // genuinely strong, winning campaign rather than a merely good one.
  [...opponents]
    .sort((a, b) => b.overall - a.overall)
    .forEach((o, i) => {
      table.push({ franchiseId: o.teamSeasonId, points: Math.max(2, Math.round(24 - i * 1.1)), netRunRate: 5 - i * 0.6 });
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
      const m = simulateMatch(yourRating, opp, false, rng, PLAYOFF_TEAM_BOOST);
      // The final is the headline act — break your XI's innings out batter by batter.
      const battingCard = stage === "FINAL" ? buildBattingCard(roster, m.yourScore, rng) : undefined;
      playoffStage.push({ ...m, stage, battingCard });
      if (!m.won) break; // knocked out
      if (stage === "FINAL") wonTitle = true;
    }
  }

  const perfectSeason = unbeatenLeagueStage && wonTitle;
  const playerStats = attributeStats(roster, [...leagueStage, ...playoffStage], seed);

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
    playerStats,
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
