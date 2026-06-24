import type { DraftSlot, PlayerRole, PlayerSeason, XiValidationIssue, XiValidationResult } from "./types";

export const XI_SIZE = 11;
export const MAX_OVERSEAS = 4;
export const MIN_BOWLING_OPTIONS = 5; // specialist bowlers + all-rounders, enough to cover 20 overs (max 4 overs/bowler)

// Each role maps to an inclusive band of legal batting slots (0-indexed; slot i == batting
// position i+1). Bands deliberately overlap — a player with several roles can fill the union.
//   TOP 1-3 · MIDDLE 3-7 · FINISHER 3-8 · BOWLER 7-11
const ROLE_SLOT_RANGE: Record<PlayerRole, [number, number]> = {
  TOP: [0, 2],
  MIDDLE: [2, 6],
  FINISHER: [2, 7],
  BOWLER: [6, 10],
};

const ROLE_LABEL: Record<PlayerRole, string> = {
  TOP: "Top order",
  MIDDLE: "Middle order",
  FINISHER: "Finisher",
  BOWLER: "Lower order",
};

export function roleLabel(role: PlayerRole): string {
  return ROLE_LABEL[role];
}

/** Set of 0-indexed slots a player may legally bat in, given their roles. */
export function allowedSlots(roles: PlayerRole[]): Set<number> {
  const slots = new Set<number>();
  for (const role of roles) {
    const [lo, hi] = ROLE_SLOT_RANGE[role];
    for (let i = lo; i <= hi; i++) slots.add(i);
  }
  return slots;
}

/** Whether a player's roles permit them to bat in this slot. */
export function canPlaceInSlot(player: PlayerSeason, slotIndex: number): boolean {
  return player.roles.some((role) => {
    const [lo, hi] = ROLE_SLOT_RANGE[role];
    return slotIndex >= lo && slotIndex <= hi;
  });
}

/** Validates a filled-or-partial XI against real IPL composition rules. */
export function validateXi(
  slots: DraftSlot[],
  playersById: Map<string, PlayerSeason>
): XiValidationResult {
  const issues: XiValidationIssue[] = [];
  const filledPlayers = slots
    .map((s) => (s.playerId ? playersById.get(s.playerId) : undefined))
    .filter((p): p is PlayerSeason => p != null);

  if (filledPlayers.length < XI_SIZE) {
    issues.push({ code: "INCOMPLETE", filled: filledPlayers.length, required: XI_SIZE });
  }

  const overseasCount = filledPlayers.filter((p) => p.isOverseas).length;
  if (overseasCount > MAX_OVERSEAS) {
    issues.push({ code: "TOO_MANY_OVERSEAS", count: overseasCount, max: MAX_OVERSEAS });
  }

  // At least one wicketkeeper — there's no upper cap on keepers.
  const keeperCount = filledPlayers.filter((p) => p.isWicketkeeper).length;
  if (keeperCount === 0) {
    issues.push({ code: "NO_WICKETKEEPER" });
  }

  const bowlingOptions = filledPlayers.filter((p) => p.bowlingRole !== "NONE").length;
  if (bowlingOptions < MIN_BOWLING_OPTIONS) {
    issues.push({
      code: "INSUFFICIENT_BOWLING",
      bowlingOptions,
      required: MIN_BOWLING_OPTIONS,
    });
  }

  return { valid: issues.length === 0, issues };
}

/** Whether a candidate player can legally be added to the XI alongside the current slots. */
export function canAddPlayer(
  candidate: PlayerSeason,
  currentSlots: DraftSlot[],
  playersById: Map<string, PlayerSeason>
): { allowed: boolean; reason?: string } {
  const filled = currentSlots.filter((s) => s.playerId != null);
  if (filled.length >= XI_SIZE) {
    return { allowed: false, reason: "XI is already full." };
  }

  if (candidate.isOverseas) {
    const overseasCount = filled.filter((s) => playersById.get(s.playerId!)?.isOverseas).length;
    if (overseasCount >= MAX_OVERSEAS) {
      return { allowed: false, reason: `Already have ${MAX_OVERSEAS} overseas players.` };
    }
  }

  // The same real person can appear as a different PlayerSeason in many different team-seasons
  // (e.g. "Dhoni 2010" and "Dhoni 2013" are different spins) — but drafting them twice into the
  // same XI isn't a real lineup, it's the same player occupying two slots.
  const alreadyDrafted = filled.some((s) => playersById.get(s.playerId!)?.personId === candidate.personId);
  if (alreadyDrafted) {
    return { allowed: false, reason: `${candidate.name} is already in your XI from a different season.` };
  }

  // Completability gate — the user must always end up with a LEGAL XI, so a pick is blocked if it
  // would leave too few slots to still reach a wicketkeeper and enough bowling. e.g. with one slot
  // left and no keeper yet, only keepers are draftable; if you still need bowlers to fill the last
  // few slots, only bowlers are draftable.
  const slotsAfter = XI_SIZE - filled.length - 1;
  const keepers = filled.filter((s) => playersById.get(s.playerId!)?.isWicketkeeper).length;
  const bowlers = filled.filter((s) => playersById.get(s.playerId!)?.bowlingRole !== "NONE").length;
  const keepersStillNeeded = Math.max(0, 1 - (keepers + (candidate.isWicketkeeper ? 1 : 0)));
  const bowlersStillNeeded = Math.max(0, MIN_BOWLING_OPTIONS - (bowlers + (candidate.bowlingRole !== "NONE" ? 1 : 0)));
  if (slotsAfter < keepersStillNeeded + bowlersStillNeeded) {
    const needs: string[] = [];
    if (keepersStillNeeded > 0) needs.push("a wicketkeeper");
    if (bowlersStillNeeded > 0) needs.push(`${bowlersStillNeeded} more bowling option${bowlersStillNeeded > 1 ? "s" : ""}`);
    return { allowed: false, reason: `Not enough spots left — you still need ${needs.join(" and ")}.` };
  }

  return { allowed: true };
}
