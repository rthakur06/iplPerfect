import type { DraftSlot, DraftState, PlayerSeason } from "./types";
import { canAddPlayer, canPlaceInSlot, XI_SIZE } from "./rules";

export function createEmptyDraftState(): DraftState {
  const slots: DraftSlot[] = Array.from({ length: XI_SIZE }, (_, i) => ({
    index: i,
    playerId: null,
  }));
  return { slots, rerolls: { teamRerollUsed: false, yearRerollUsed: false } };
}

/**
 * Places a drafted player into a chosen batting slot. The slot must be legal for the player's
 * roles (rules.ts: TOP 1-3, MIDDLE 3-7, FINISHER 3-8, BOWLER 7-11). If no slot is given, drops
 * them into the first open slot they're allowed to bat in.
 */
export function placePlayer(
  state: DraftState,
  player: PlayerSeason,
  playersById: Map<string, PlayerSeason>,
  targetSlotIndex?: number
): { state: DraftState; placed: boolean; reason?: string } {
  const check = canAddPlayer(player, state.slots, playersById);
  if (!check.allowed) {
    return { state, placed: false, reason: check.reason };
  }

  let slotIndex = targetSlotIndex;
  if (slotIndex != null) {
    if (state.slots[slotIndex]?.playerId != null) {
      return { state, placed: false, reason: "That slot is already taken." };
    }
    if (!canPlaceInSlot(player, slotIndex)) {
      return { state, placed: false, reason: `${player.name} can't bat at position ${slotIndex + 1}.` };
    }
  } else {
    slotIndex = state.slots.findIndex((s) => s.playerId == null && canPlaceInSlot(player, s.index));
    if (slotIndex === -1) {
      return { state, placed: false, reason: `No open slot where ${player.name} can bat.` };
    }
  }

  const slots = state.slots.map((s, i) =>
    i === slotIndex ? { ...s, playerId: player.id } : s
  );
  return { state: { ...state, slots }, placed: true };
}

/** Swaps two slots' players (reshuffling batting order). Rejected as a no-op if the swap would
 *  put either player in a position their roles don't allow. */
export function movePlayer(
  state: DraftState,
  fromIndex: number,
  toIndex: number,
  playersById: Map<string, PlayerSeason>
): DraftState {
  const slots = state.slots.map((s) => ({ ...s }));
  const fromSlot = slots.find((s) => s.index === fromIndex);
  const toSlot = slots.find((s) => s.index === toIndex);
  if (!fromSlot || !toSlot) return state;

  const fromPlayer = fromSlot.playerId ? playersById.get(fromSlot.playerId) : null;
  const toPlayer = toSlot.playerId ? playersById.get(toSlot.playerId) : null;
  // After the swap, fromPlayer sits in toSlot and toPlayer sits in fromSlot.
  if (fromPlayer && !canPlaceInSlot(fromPlayer, toIndex)) return state;
  if (toPlayer && !canPlaceInSlot(toPlayer, fromIndex)) return state;

  const tmp = toSlot.playerId;
  toSlot.playerId = fromSlot.playerId;
  fromSlot.playerId = tmp;
  return { ...state, slots };
}

/** Removes a player from the XI, freeing their slot (e.g. to undo a bad pick before locking in). */
export function removePlayer(state: DraftState, slotIndex: number): DraftState {
  const slots = state.slots.map((s) => (s.index === slotIndex ? { ...s, playerId: null } : s));
  return { ...state, slots };
}

export function isComplete(state: DraftState): boolean {
  return state.slots.every((s) => s.playerId != null);
}
