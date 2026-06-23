// The engine works on a compressed internal scale: because it z-scores two metrics and averages
// them, even all-time-great seasons top out in the low-to-mid 80s and an average season sits in the
// mid-40s. That reads wrong as a "card rating" (nothing ever looks elite). So for display only we
// stretch it onto an intuitive out-of-100 scale where the best real players land in the 93-99 band
// and a league-average season sits in the high 50s. The simulation and odds keep the raw internal
// numbers — this transform is purely cosmetic and monotonic, so a better player always shows higher.
export function toDisplayRating(raw: number): number {
  if (raw <= 0) return 0; // an empty/undrafted slot has no rating to stretch
  return Math.max(1, Math.min(99, Math.round(11 + raw * 1.07)));
}
