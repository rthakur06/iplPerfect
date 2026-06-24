// The engine works on a compressed internal scale (it z-scores two metrics and averages them), so a
// league-average season sits around the mid-40s and even all-time greats top out in the low-to-mid
// 80s. For display only we remap it onto an intuitive out-of-100 scale where a league-AVERAGE season
// reads ~50, strong starters land in the 70s–80s, and elite seasons reach the 90s (the very best,
// 99). The line below is anchored on the real distribution: internal 44 (the median) -> ~50, and
// internal 78 (an elite season) -> ~90. The simulation and odds keep the raw internal numbers —
// this transform is purely cosmetic and monotonic, so a better player always shows higher.
export function toDisplayRating(raw: number): number {
  if (raw <= 0) return 0; // an empty/undrafted slot has no rating to show
  return Math.max(1, Math.min(99, Math.round(raw * 1.18 - 2)));
}

// Team ratings use their OWN scale, anchored so 90+ is a "clearly strong draft" — about the top 30%
// of well-drafted XIs (internal ~59), which is the level that dominates: ~13-1 in the league and a
// ~30% chance of going unbeaten. The strongest XI you can realistically build (~internal 65) reads
// 99, and a mediocre side (~internal 50) reads ~76. Anchored on internal 59→90 and 65→99.
//
// One linear map is applied to overall AND batting/bowling/fielding, so Overall stays the weighted
// average of the three parts shown beside it. Display-only — the sim and odds use the raw internals.
export function toDisplayTeamRating(raw: number): number {
  if (raw <= 0) return 0;
  return Math.max(1, Math.min(99, Math.round(raw * 1.5 + 1.5)));
}
