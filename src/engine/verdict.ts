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
    "Played 14, lost most of them. The wooden spoon was never really in doubt.",
    "A season to forget — and you will, the moment you spin again.",
  ],
  MID_TABLE: ["Solid, unremarkable, forgettable. Mid-table is where dreams go to nap."],
  PLAYOFF_BOUND: ["You made the cut. The real test starts now."],
  FINALIST: ["So close to immortality — and so far. A final is still a final, though."],
  CHAMPIONS: ["Champions. Not unbeaten, but a trophy is a trophy."],
  UNBEATEN_LEAGUE_STAGE: ["Unbeaten through the league stage. Now don't blow it in the playoffs."],
  PERFECT_SEASON: ["PERFECT SEASON. Unbeaten and untouchable. Played 14, won 14, won it all."],
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
