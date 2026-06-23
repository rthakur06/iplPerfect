import type { ResultTier } from "@/engine/types";

export interface TierTheme {
  label: string;
  accent: string; // ink-on-paper accent for headings/badges
  badgeBg: string; // soft tint behind the tier badge
}

// Tuned for the dark broadcast palette — neon-ish accents on a faint same-hue glass chip. badgeBg
// uses a low-alpha tint so the chip reads correctly in both dark and light themes.
export const TIER_THEME: Record<ResultTier, TierTheme> = {
  WOODEN_SPOON: { label: "Wooden Spoon", accent: "#ff6a5d", badgeBg: "rgba(255, 106, 93, 0.16)" },
  MID_TABLE: { label: "Mid-Table", accent: "#9aa6c2", badgeBg: "rgba(154, 166, 194, 0.16)" },
  PLAYOFF_BOUND: { label: "Playoff Bound", accent: "#00e676", badgeBg: "rgba(0, 230, 118, 0.16)" },
  FINALIST: { label: "Finalist", accent: "#3aa0ff", badgeBg: "rgba(58, 160, 255, 0.16)" },
  CHAMPIONS: { label: "Champions", accent: "#e6a700", badgeBg: "rgba(230, 167, 0, 0.18)" },
  UNBEATEN_LEAGUE_STAGE: { label: "Unbeaten League Stage", accent: "#00d9c7", badgeBg: "rgba(0, 217, 199, 0.16)" },
  PERFECT_SEASON: { label: "Perfect Season", accent: "#ffd700", badgeBg: "rgba(255, 215, 0, 0.18)" },
};
