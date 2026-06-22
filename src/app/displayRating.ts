// Team ratings now come out of src/engine/rating.ts already on an intuitive 0-100 scale (the
// position-weighted batting / best-attack bowling aggregates of the players' own 0-100 ratings),
// so display is just a clamp + round — no opaque percentile rescale layer anymore.
export function toDisplayRating(raw: number): number {
  return Math.max(0, Math.min(99, Math.round(raw)));
}
