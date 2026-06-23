import type { ResultTier, SeasonResult, Verdict } from "./types";

export function determineTier(result: SeasonResult): ResultTier {
  if (result.perfectSeason) return "PERFECT_SEASON";
  if (result.unbeatenLeagueStage) return "UNBEATEN_LEAGUE_STAGE";
  if (result.wonTitle) return "CHAMPIONS";
  if (result.playoffStage.some((m) => m.stage === "FINAL")) return "FINALIST";
  if (result.madePlayoffs) return "PLAYOFF_BOUND";
  if (result.finalRank <= 7) return "MID_TABLE";
  return "WOODEN_SPOON";
}

function computeBadges(result: SeasonResult): string[] {
  const badges: string[] = [];
  if (result.unbeatenLeagueStage) badges.push("Unbeaten League Stage");
  if (result.points >= 24) badges.push("Record Points Haul");
  const leagueGoalsAgainst = result.leagueStage.reduce((sum, m) => sum + m.theirScore.runs, 0);
  if (leagueGoalsAgainst / Math.max(1, result.leagueStage.length) < 130) badges.push("Watertight Bowling Attack");
  if (result.wonTitle && result.finalRank > 1) badges.push("Against All Odds");
  return badges;
}

const VERDICT_LINES: Record<ResultTier, string[]> = {
  WOODEN_SPOON: [
    "Bottom of the table. Lost more than you won and finished where the points put you.",
    "Rough one. The draft didn't come together — worth another spin.",
  ],
  MID_TABLE: ["Mid-table finish. Decent in patches, not enough to trouble the top four."],
  PLAYOFF_BOUND: ["Top four, so you're into the playoffs. The hard part starts now."],
  FINALIST: ["Runners-up. You made the final and came up a bit short."],
  CHAMPIONS: ["Champions. Dropped a game or two along the way, but you lifted the trophy."],
  UNBEATEN_LEAGUE_STAGE: ["Won all 14 in the league, then fell in the playoffs. One step from the full set."],
  PERFECT_SEASON: ["Perfect season. Won all 14, then won the title — something no real IPL side has ever done."],
};

function pickVerdictLine(tier: ResultTier, deterministicIndex: number): string {
  const options = VERDICT_LINES[tier];
  return options[deterministicIndex % options.length];
}

export function buildVerdict(result: SeasonResult): Verdict {
  const tier = determineTier(result);
  const badges = computeBadges(result);
  const easterEgg = result.perfectSeason ? "GOAT" : result.loseEverySingleGame ? "ZERO_WINS" : null;
  const verdictLine = pickVerdictLine(tier, result.points);

  return { tier, badges, verdictLine, easterEgg };
}
