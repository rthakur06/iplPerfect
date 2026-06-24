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

// Team ratings use their OWN scale, anchored so the top end is genuinely hard to reach. internal
// 60→90 (a clearly strong, ~top-15% draft that dominates the league), 50→75 (mediocre). The very
// best XI you could possibly assemble — the all-time greats, ~internal 64 — only reads ~96, and a
// 99 needs internal 66, which is ABOVE that ceiling: near-impossible by design. Map is `raw * 1.5`.
//
// One linear map is applied to overall AND batting/bowling/fielding, so Overall stays the weighted
// average of the three parts shown beside it. Display-only — the sim and odds use the raw internals.
export function toDisplayTeamRating(raw: number): number {
  if (raw <= 0) return 0;
  return Math.max(1, Math.min(99, Math.round(raw * 1.5)));
}
