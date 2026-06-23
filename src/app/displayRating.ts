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

// Team ratings use their OWN scale, anchored to the actual playoff/title ODDS so the number predicts
// results. A 90+ is an uncommon feat (needs a draft stronger than any single real team-season): a 90
// (internal 60) wins a few playoff games and takes the title ~1 season in 3; a 94 (internal 62) is a
// coin-flip for the championship; 99 (internal 64, the all-time greats) wins it ~two-thirds. The
// best real team-season (~56 internal) lands around 81, a mediocre XI (~50) around 68.
//
// One linear map is applied to overall AND batting/bowling/fielding, so Overall stays the weighted
// average of the three parts shown beside it. Display-only — the sim and odds use the raw internals.
export function toDisplayTeamRating(raw: number): number {
  if (raw <= 0) return 0;
  return Math.max(1, Math.min(99, Math.round(raw * 2.25 - 45)));
}
