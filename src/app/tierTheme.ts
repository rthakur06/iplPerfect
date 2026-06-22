import type { ResultTier } from "@/engine/types";

export interface TierTheme {
  label: string;
  accent: string; // ink-on-paper accent for headings/badges
  badgeBg: string; // soft tint behind the tier badge
}

// Tuned for the warm-paper / screenprint palette — accents that read as printed spot inks.
export const TIER_THEME: Record<ResultTier, TierTheme> = {
  WOODEN_SPOON: { label: "Wooden Spoon", accent: "#a82c1a", badgeBg: "#e7cfc2" },
  MID_TABLE: { label: "Mid-Table", accent: "#6a5d49", badgeBg: "#ddd0b4" },
  PLAYOFF_BOUND: { label: "Playoff Bound", accent: "#356b46", badgeBg: "#cdddc2" },
  FINALIST: { label: "Finalist", accent: "#b07d1c", badgeBg: "#ecdcb0" },
  CHAMPIONS: { label: "Champions", accent: "#d8402a", badgeBg: "#f0d4c2" },
  UNBEATEN_LEAGUE_STAGE: { label: "Unbeaten League Stage", accent: "#2c5a3a", badgeBg: "#c6d8bc" },
  PERFECT_SEASON: { label: "Perfect Season", accent: "#d8402a", badgeBg: "#f0d4c2" },
};
