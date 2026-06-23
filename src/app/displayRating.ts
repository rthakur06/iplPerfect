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

// Team ratings use their OWN, more generous scale than individual players. A team is a whole side
// measured against the all-time field, so the bands are: best XI you can realistically build ~96-99,
// elite ~92-95, very good ~88-91, good ~83-88, mediocre ~75, and down from there. Anchored on the
// real team-strength distribution: a 50-internal side (a thoroughly mediocre XI) -> 75, and the
// strongest possible XI (~64 internal, the all-time greats) -> 99.
//
// One linear map is applied to overall AND batting/bowling/fielding, so Overall stays exactly the
// weighted average of the three parts shown beside it (no "overall higher than its components"
// weirdness). Like the player scale, this is display-only — the sim and odds use the raw internals,
// so these bands line up with the actual playoff/title/record odds.
export function toDisplayTeamRating(raw: number): number {
  if (raw <= 0) return 0;
  return Math.max(1, Math.min(99, Math.round(raw * 1.7 - 10)));
}
