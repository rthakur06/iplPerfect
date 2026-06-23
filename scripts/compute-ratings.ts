// Converts raw per-player-season stats (from parse-cricsheet.ts) into the 0-99 RatingBlock
// shape the engine expects (src/engine/types.ts: bat/bowl/field/ovr).
//
// Calibration approach: rather than hand-picking "average IPL batter = 28" type constants,
// compute the actual mean/stddev of each underlying metric across the real dataset, then
// score every player as a z-score relative to that real distribution (50 = exactly average,
// ~20 points per standard deviation, clamped to 1-99 — so a truly elite season reaches the
// mid-90s and a poor full season drops into the teens, spanning the full 0-100 scale).
//
// Small-sample fix: a fluky 1-innings cameo (or a not-out that inflates an average) shouldn't
// be rated like a season-long star. We shrink each player's *rate stats* (average, strike rate,
// economy, ...) toward the league mean in proportion to how few balls/matches they have — proper
// Bayesian shrinkage toward the prior, which pulls BOTH over- and under-stated small samples
// back toward "we don't really know, call it average". Players below a confidence threshold are
// also flagged `limitedSample` so the UI can label them.
//
// Usage:
//   npx tsx scripts/compute-ratings.ts

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { battingAverage, strikeRate, economy, wicketRatePerOver } from "./stat-formulas";

const STATS_FILE = resolve("data/generated/player-season-stats.json");
const OUTPUT_FILE = resolve("data/generated/player-ratings.json");

// Below this many balls faced/bowled, a metric is too noisy to calibrate the league
// distribution from (a 3-ball cameo doesn't tell you much about "true" strike rate).
const MIN_BALLS_FOR_BATTING_CALIBRATION = 30;
const MIN_BALLS_FOR_BOWLING_CALIBRATION = 24;

// Shrinkage pseudo-counts: how many balls/matches it takes to trust the observed rate at
// face value. Below this, we blend toward the NON_PERFORMER_FLOOR.
const BATTING_SHRINKAGE_BALLS = 60;
// A batting average is only as reliable as the number of times the batter was actually OUT — a
// season of 152 runs for 1 dismissal is a not-out artefact, not a true average of 152. So we
// shrink the average toward the league mean by dismissals (this many pseudo-dismissals of prior).
const BATTING_AVG_PSEUDO_DISMISSALS = 5;
const BOWLING_SHRINKAGE_BALLS = 48;
const FIELDING_SHRINKAGE_MATCHES = 10;
const NON_PERFORMER_FLOOR = 12; // rating for "essentially didn't do this discipline at all"
const FIELDING_FLOOR = 28;

// Small-sample penalty: beyond shrinking the *rate* toward the league mean, we also pull the final
// rating toward the floor when a player simply hasn't done enough — a brilliant 40-ball cameo must
// not out-rate a full season. Confidence ramps linearly to 1 at a full workload.
const FULL_BAT_BALLS = 130;
const FULL_BOWL_BALLS = 110;

// Below this confidence in either discipline, the player-season is flagged `limitedSample` so the
// UI can warn the user the rating is built on very little real cricket.
const LIMITED_SAMPLE_MATCHES = 4;
const LIMITED_SAMPLE_BATTING_BALLS = 45;
const LIMITED_SAMPLE_BOWLING_BALLS = 36;

// Threshold for "bowling is a real part of this player's game" in the ovr specialist/allrounder
// split below. Deliberately higher than MIN_BALLS_FOR_BOWLING_CALIBRATION: a destructive batter
// who bowled 5 token part-time overs across a season (e.g. Chris Gayle) shouldn't be reclassified
// as an allrounder and penalized for a discipline that was never really their job.
const ALLROUNDER_BOWLING_BALLS_THRESHOLD = 60;

interface BattingStats {
  innings: number;
  runs: number;
  balls: number;
  dismissals: number;
  fours: number;
  sixes: number;
  positionSum: number;
}
interface BowlingStats {
  balls: number;
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
interface TeamSeasonStats {
  franchiseId: string;
  season: number;
  players: PlayerSeasonAgg[];
}

interface RatingBlock {
  bat: number;
  bowl: number;
  field: number;
  ovr: number;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
function stddev(values: number[], avg: number): number {
  return Math.sqrt(mean(values.map((v) => (v - avg) ** 2)));
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function zToRating(z: number): number {
  return clamp(Math.round(50 + z * 20), 1, 99);
}
function shrinkageWeight(sampleSize: number, pseudoCount: number): number {
  return sampleSize / (sampleSize + pseudoCount);
}

interface Distribution {
  mean: number;
  sd: number;
}

function computeDistribution(values: number[]): Distribution {
  const m = mean(values);
  const sd = stddev(values, m) || 1; // avoid div-by-zero on a degenerate distribution
  return { mean: m, sd };
}

function fieldRatePerMatch(f: FieldingStats, matches: number): number {
  return matches > 0 ? (f.catches + f.stumpings) / matches : 0;
}

function main(): void {
  const stats = JSON.parse(readFileSync(STATS_FILE, "utf-8")) as Record<string, TeamSeasonStats>;
  const allPlayers = Object.values(stats).flatMap((ts) => ts.players);

  const battingSample = allPlayers.filter((p) => p.batting.balls >= MIN_BALLS_FOR_BATTING_CALIBRATION);
  const bowlingSample = allPlayers.filter((p) => p.bowling.balls >= MIN_BALLS_FOR_BOWLING_CALIBRATION);
  const fieldingSample = allPlayers.filter((p) => p.matches > 0);

  const avgDist = computeDistribution(battingSample.map((p) => battingAverage(p.batting)));
  const srDist = computeDistribution(battingSample.map((p) => strikeRate(p.batting)));
  const econDist = computeDistribution(bowlingSample.map((p) => economy(p.bowling)));
  const wicketRateDist = computeDistribution(bowlingSample.map((p) => wicketRatePerOver(p.bowling)));
  const fieldDist = computeDistribution(fieldingSample.map((p) => fieldRatePerMatch(p.fielding, p.matches)));

  // Shrink an observed rate toward the league mean by sample-size confidence, then z-score the
  // shrunk value. Small samples land near 50 ("we don't know"); big samples keep their real edge.
  function shrunkZ(observed: number, dist: Distribution, sample: number, pseudo: number): number {
    const w = shrinkageWeight(sample, pseudo);
    const shrunk = observed * w + dist.mean * (1 - w);
    return (shrunk - dist.mean) / dist.sd;
  }

  // Pull a rating toward the floor for thin workloads (linear confidence to 1 at a full season).
  function samplePenalty(rating: number, floor: number, sample: number, full: number): number {
    const confidence = clamp(sample / full, 0, 1);
    return Math.round(floor + (rating - floor) * confidence);
  }

  function computeBat(p: PlayerSeasonAgg): number {
    if (p.batting.balls === 0) return NON_PERFORMER_FLOOR;
    // Average shrinks by dismissals (its real sample size — kills the not-out skew); strike rate
    // shrinks by balls faced.
    const wAvg = shrinkageWeight(p.batting.dismissals, BATTING_AVG_PSEUDO_DISMISSALS);
    const shrunkAvg = battingAverage(p.batting) * wAvg + avgDist.mean * (1 - wAvg);
    const zAvg = (shrunkAvg - avgDist.mean) / avgDist.sd;
    const zSr = shrunkZ(strikeRate(p.batting), srDist, p.batting.balls, BATTING_SHRINKAGE_BALLS);
    return samplePenalty(zToRating((zAvg + zSr) / 2), NON_PERFORMER_FLOOR, p.batting.balls, FULL_BAT_BALLS);
  }

  function computeBowl(p: PlayerSeasonAgg): number {
    if (p.bowling.balls === 0) return NON_PERFORMER_FLOOR;
    // Lower economy is better -> invert by measuring the rate as a deficit below the mean.
    const w = shrinkageWeight(p.bowling.balls, BOWLING_SHRINKAGE_BALLS);
    const shrunkEcon = economy(p.bowling) * w + econDist.mean * (1 - w);
    const zEcon = (econDist.mean - shrunkEcon) / econDist.sd;
    const zWicketRate = shrunkZ(wicketRatePerOver(p.bowling), wicketRateDist, p.bowling.balls, BOWLING_SHRINKAGE_BALLS);
    return samplePenalty(zToRating((zEcon + zWicketRate) / 2), NON_PERFORMER_FLOOR, p.bowling.balls, FULL_BOWL_BALLS);
  }

  function computeField(p: PlayerSeasonAgg): number {
    if (p.matches === 0) return FIELDING_FLOOR;
    const z = shrunkZ(fieldRatePerMatch(p.fielding, p.matches), fieldDist, p.matches, FIELDING_SHRINKAGE_MATCHES);
    const raw = zToRating(z);
    // Keepers/cordon fielders can post low catch rates yet still be Test-class in hand; keep a
    // gentle floor so fielding never tanks a player the way a genuine non-batter's bat score can.
    return Math.max(FIELDING_FLOOR, raw);
  }

  function isLimitedSample(p: PlayerSeasonAgg): boolean {
    if (p.matches < LIMITED_SAMPLE_MATCHES) return true;
    return p.batting.balls < LIMITED_SAMPLE_BATTING_BALLS && p.bowling.balls < LIMITED_SAMPLE_BOWLING_BALLS;
  }

  // `ovr` is a cosmetic "card rating" only — computeTeamRating() in src/engine/rating.ts reads
  // bat/bowl directly and already applies role-based weighting at the team level (a non-bowler's
  // weak bowl score correctly drags down team bowling depth there). So this shouldn't re-punish
  // a specialist for a discipline they never attempted, the way a flat bat/bowl/field blend would.
  function computeOvr(p: PlayerSeasonAgg, bat: number, bowl: number, field: number): number {
    // ">0" is too lenient here — plenty of specialist batters bowled a token over or two across
    // a career and shouldn't be reclassified as "allrounder" for it. Require a real sample,
    // matching the same thresholds used to trust the underlying rate stats in the first place.
    const isBatter = p.batting.balls >= MIN_BALLS_FOR_BATTING_CALIBRATION;
    const isBowler = p.bowling.balls >= ALLROUNDER_BOWLING_BALLS_THRESHOLD;

    if (isBatter && isBowler) {
      const best = Math.max(bat, bowl);
      const worst = Math.min(bat, bowl);
      return Math.round(best * 0.55 + worst * 0.35 + field * 0.1);
    }
    if (isBatter) return Math.round(bat * 0.85 + field * 0.15);
    if (isBowler) return Math.round(bowl * 0.85 + field * 0.15);
    // Below-threshold sample on both disciplines (e.g. a fringe player with a handful of balls
    // in each) — fall back to whichever has marginally more signal rather than discarding both.
    const primary = p.batting.balls >= p.bowling.balls ? bat : bowl;
    return Math.round(primary * 0.85 + field * 0.15);
  }

  const output: Record<string, { franchiseId: string; season: number; players: { personId: string; name: string; rating: RatingBlock; limitedSample: boolean }[] }> = {};

  for (const [teamSeasonId, ts] of Object.entries(stats)) {
    output[teamSeasonId] = {
      franchiseId: ts.franchiseId,
      season: ts.season,
      players: ts.players.map((p) => {
        const bat = computeBat(p);
        const bowl = computeBowl(p);
        const field = computeField(p);
        return {
          personId: p.personId,
          name: p.name,
          rating: { bat, bowl, field, ovr: computeOvr(p, bat, bowl, field) },
          limitedSample: isLimitedSample(p),
        };
      }),
    };
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Calibration — batting avg: ${avgDist.mean.toFixed(1)}±${avgDist.sd.toFixed(1)}, SR: ${srDist.mean.toFixed(1)}±${srDist.sd.toFixed(1)}`);
  console.log(`Calibration — economy: ${econDist.mean.toFixed(2)}±${econDist.sd.toFixed(2)}, wkt/over: ${wicketRateDist.mean.toFixed(3)}±${wicketRateDist.sd.toFixed(3)}`);
  console.log(`Wrote ratings for ${Object.keys(output).length} team-seasons -> ${OUTPUT_FILE}`);
}

main();
