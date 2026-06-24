// Shared types for the IPL Perfect Season engine. Framework-agnostic, no React/Next imports here.

// A player's eligible batting-order categories, derived from their real average batting position
// (and bowling load). A player can hold several — e.g. a hard-hitting No.5 is MIDDLE + FINISHER.
// Each role maps to a contiguous band of legal batting slots (see rules.ts ROLE_SLOT_RANGE):
//   TOP 1-3 · MIDDLE 3-7 · FINISHER 3-8 · BOWLER 7-11.
export type PlayerRole = "TOP" | "MIDDLE" | "FINISHER" | "BOWLER";
export type BowlingRole = "NONE" | "PACE" | "SPIN";

export interface RatingBlock {
  bat: number; // 0-99
  bowl: number; // 0-99
  field: number; // 0-99
  ovr: number; // 0-99, precomputed weighted blend
}

export interface PlayerSeasonStats {
  matches: number;
  battingInnings: number;
  runs: number;
  ballsFaced: number;
  battingAverage: number;
  strikeRate: number;
  fours: number;
  sixes: number;
  oversBowled: number;
  wickets: number;
  runsConceded: number;
  economy: number;
  catches: number;
  stumpings: number;
  avgBattingPosition: number; // real average batting-order position (1 = opener), drives roles
}

export interface PlayerSeason {
  id: string; // unique per season, e.g. "<personId>@CSK-2010"
  personId: string; // stable across every season the same real person appears in — used to stop the same person being drafted twice from two different spins
  name: string; // text-only, no photos/crests
  teamSeasonId: string; // FK -> TeamSeason.id
  isWicketkeeper: boolean;
  isOverseas: boolean;
  roles: PlayerRole[]; // eligible batting categories; gates which XI slots they can fill
  bowlingRole: BowlingRole;
  rating: RatingBlock; // season-specific only (locked decision: no career-peak mode)
  limitedSample: boolean; // true when too few balls/matches to trust the rating — flagged in the UI
  stats: PlayerSeasonStats; // raw real-world numbers behind the rating, shown alongside it in the UI
}

export interface TeamSeason {
  id: string; // e.g. "CSK-2010"
  franchiseId: string; // e.g. "CSK"
  season: number; // year, e.g. 2010
  leagueFinish: LeagueFinish; // used for wheel prestige weighting + flavour
  playerIds: string[]; // full squad for that season
}

export type LeagueFinish =
  | { result: "CHAMPION" }
  | { result: "RUNNER_UP" }
  | { result: "PLAYOFFS"; rank: number } // 3rd/4th via eliminator etc.
  | { result: "LEAGUE_STAGE"; rank: number }; // didn't make playoffs

export interface Franchise {
  id: string; // e.g. "CSK"
  name: string; // e.g. "Chennai Super Kings"
  activeSeasons: number[]; // valid years this franchise existed (gates the wheel pool)
}

// --- XI / draft ---

export interface DraftSlot {
  index: number; // 0-10, also doubles as proposed batting order position
  playerId: string | null;
}

export interface DraftState {
  slots: DraftSlot[]; // length 11
  rerolls: {
    teamRerollUsed: boolean; // swap team, keep season
    yearRerollUsed: boolean; // swap season, keep team
  };
}

export type XiValidationIssue =
  | { code: "TOO_MANY_OVERSEAS"; count: number; max: number }
  | { code: "NO_WICKETKEEPER" }
  | { code: "INSUFFICIENT_BOWLING"; bowlingOptions: number; required: number }
  | { code: "INCOMPLETE"; filled: number; required: number };

export interface XiValidationResult {
  valid: boolean;
  issues: XiValidationIssue[];
}

// --- ratings / odds ---

export interface TeamRatingBreakdown {
  batting: number;
  bowling: number;
  fielding: number;
  overall: number;
}

export interface SeasonOdds {
  projectedFinish: number; // 1-15
  expectedPoints: number;
  playoffOdds: number; // 0-1 (top-4 finish)
  titleOdds: number; // 0-1 (beat the all-time gauntlet)
  unbeatenOdds: number; // 0-1 (win all 14 league games)
  wodenSpoonOdds: number; // 0-1 (bottom of the table)
}

// --- simulation ---

// A pitch favours pace, favours spin, or is neutral — a team that can't exploit it pays a small toll.
export type PitchType = "PACE" | "SPIN" | "NEUTRAL";

export interface MatchResult {
  opponentFranchiseId: string;
  opponentName: string; // real franchise name, e.g. "Mumbai Indians"
  opponentSeason: number; // real season the opponent is drawn from, e.g. 2019
  isHome: boolean;
  pitch: PitchType;
  yourScore: { runs: number; wickets: number; overs: number };
  theirScore: { runs: number; wickets: number; overs: number };
  youBattedFirst: boolean; // whether your XI batted the first innings (vs chasing)
  won: boolean;
  tied: boolean;
}

// Playoffs are an escalating gauntlet: a strong side, a stronger side, then the GOAT in the final.
export type PlayoffStage = "QUALIFIER" | "SEMI_FINAL" | "FINAL";

// One batter's line in a single innings (used for the final's ball-by-ball-feel scorecard).
export interface BatterLine {
  name: string;
  runs: number;
  balls: number;
  out: boolean; // false = not out / remained at the crease
}

// A super over decides a tied playoff match (ties in the league stage stay ties for points).
export interface SuperOverResult {
  yourRuns: number;
  yourWickets: number;
  theirRuns: number;
  theirWickets: number;
  youBattedFirst: boolean;
  won: boolean;
}

export interface PlayoffMatchResult extends MatchResult {
  stage: PlayoffStage;
  battingCard?: BatterLine[]; // your XI's innings, batter by batter — only built for the FINAL
  superOver?: SuperOverResult; // present only when the match was tied and went to a super over
}

// A drafted player's identity + ratings, handed to the sim so it can attribute season stats.
export interface SimRosterPlayer {
  id: string;
  name: string;
  slotIndex: number;
  bowls: boolean;
  bowlType: BowlingRole; // PACE / SPIN / NONE — drives the pitch matchup
  bat: number;
  bowl: number;
  field: number;
}

// Per-player simulated season tallies (attributed from the team totals, not a guess of real data).
export interface SimPlayerStat {
  playerId: string;
  name: string;
  runs: number;
  ballsFaced: number;
  strikeRate: number;
  sixes: number;
  wickets: number;
  oversBowled: number;
  economy: number;
  catches: number;
}

export interface SeasonResult {
  seed: string;
  leagueStage: MatchResult[]; // 14 games, round robin vs 9 opponents home & away
  madePlayoffs: boolean;
  playoffStage: PlayoffMatchResult[];
  wonTitle: boolean;
  unbeatenLeagueStage: boolean;
  perfectSeason: boolean; // unbeaten league stage + won title
  loseEverySingleGame: boolean; // hidden easter egg
  points: number;
  netRunRate: number;
  finalRank: number;
  playerStats: SimPlayerStat[]; // your XI's individual contributions across the season
}

// --- verdict ---

export type ResultTier =
  | "WOODEN_SPOON"
  | "MID_TABLE"
  | "PLAYOFF_BOUND"
  | "FINALIST"
  | "CHAMPIONS"
  | "UNBEATEN_LEAGUE_STAGE"
  | "PERFECT_SEASON";

export interface Verdict {
  tier: ResultTier;
  badges: string[];
  verdictLine: string;
  easterEgg: "GOAT" | "ZERO_WINS" | null;
}
