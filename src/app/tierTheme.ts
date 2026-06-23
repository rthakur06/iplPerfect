import type { ResultTier } from "@/engine/types";

export interface TierTheme {
  label: string;
  accent: string; // ink-on-paper accent for headings/badges
  badgeBg: string; // soft tint behind the tier badge
}

// Accents that read as printed spot inks; badgeBg uses a low-alpha tint of the accent so the chip
// works in both light and dark themes.
export const TIER_THEME: Record<ResultTier, TierTheme> = {
  WOODEN_SPOON: { label: "Wooden Spoon", accent: "#c0392b", badgeBg: "rgba(192, 57, 43, 0.16)" },
  MID_TABLE: { label: "Mid-Table", accent: "#8a7d63", badgeBg: "rgba(138, 125, 99, 0.18)" },
  PLAYOFF_BOUND: { label: "Playoff Bound", accent: "#2e6b46", badgeBg: "rgba(46, 107, 70, 0.18)" },
  FINALIST: { label: "Finalist", accent: "#b07d1c", badgeBg: "rgba(176, 125, 28, 0.18)" },
  CHAMPIONS: { label: "Champions", accent: "#d8402a", badgeBg: "rgba(216, 64, 42, 0.16)" },
  UNBEATEN_LEAGUE_STAGE: { label: "Unbeaten League Stage", accent: "#2c7a4a", badgeBg: "rgba(44, 122, 74, 0.18)" },
  PERFECT_SEASON: { label: "Perfect Season", accent: "#d8402a", badgeBg: "rgba(216, 64, 42, 0.16)" },
};
