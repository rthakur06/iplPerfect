// Precomputed playing strength of teams, used to populate the season simulation.
//   - League stage: every real team-season, drawn at random (real franchises & years).
//   - Playoffs: three constructed "best of all time" sides that ramp in strength, because no single
//     real franchise-season is as strong as a cherry-picked draft — the final boss has to be the
//     greatest players in IPL history assembled into one XI to be a genuine wall.
// All strengths come from the same computeTeamRating the player's own XI uses, so everyone sits on
// the exact same 0-100 scale.

import { ALL_TEAM_SEASONS, PLAYER_SEASONS_BY_ID } from "./data/dataset";
import { getFranchise } from "./data/franchises";
import { computeTeamRating } from "./rating";
import { canPlaceInSlot, MAX_OVERSEAS, XI_SIZE } from "./rules";
import type { BowlingRole, DraftSlot, PlayerRole, PlayerSeason, TeamSeason } from "./types";

export interface TeamStrength {
  teamSeasonId: string;
  franchiseId: string;
  season: number; // 0 for a constructed all-time side (display by name only)
  name: string;
  batting: number;
  bowling: number;
  overall: number;
}

const playersById = new Map(Object.entries(PLAYER_SEASONS_BY_ID));

/** Greedy best legal XI from a candidate list: highest OVR first into the first slot they may bat,
 *  respecting role, overseas and keeper caps. */
function greedyXi(candidates: PlayerSeason[]): DraftSlot[] {
  const slots: DraftSlot[] = Array.from({ length: XI_SIZE }, (_, i) => ({ index: i, playerId: null }));
  const sorted = [...candidates].sort((a, b) => b.rating.ovr - a.rating.ovr);
  const usedPerson = new Set<string>();
  let overseas = 0;
  for (const p of sorted) {
    if (slots.every((s) => s.playerId != null)) break;
    if (usedPerson.has(p.personId)) continue; // no duplicate real people in an all-time XI
    if (p.isOverseas && overseas >= MAX_OVERSEAS) continue;
    const slot = slots.find((s) => s.playerId == null && canPlaceInSlot(p, s.index));
    if (!slot) continue;
    slot.playerId = p.id;
    usedPerson.add(p.personId);
    if (p.isOverseas) overseas++;
  }
  return slots;
}

function strengthOf(slots: DraftSlot[]): { batting: number; bowling: number; overall: number } {
  const r = computeTeamRating(slots, playersById);
  return { batting: r.batting, bowling: r.bowling, overall: r.overall };
}

// ── League field: real team-seasons ──────────────────────────────────────────
function teamSeasonStrength(ts: TeamSeason): TeamStrength {
  const squad = ts.playerIds.map((id) => PLAYER_SEASONS_BY_ID[id]).filter((p): p is PlayerSeason => p != null);
  return {
    teamSeasonId: ts.id,
    franchiseId: ts.franchiseId,
    season: ts.season,
    name: getFranchise(ts.franchiseId)?.name ?? ts.franchiseId,
    ...strengthOf(greedyXi(squad)),
  };
}

export const TEAM_STRENGTHS: TeamStrength[] = ALL_TEAM_SEASONS.map(teamSeasonStrength);

// ── Playoff bosses: constructed all-time XIs that ramp in strength ────────────
const ALL_PLAYERS = Object.values(PLAYER_SEASONS_BY_ID);
const BY_OVR = [...ALL_PLAYERS].sort((a, b) => b.rating.ovr - a.rating.ovr);

// One player in a boss XI, slim enough to ship to the client for the "who you'll face" preview.
export interface BossPlayer {
  name: string;
  ovr: number; // raw internal rating — the UI applies the display transform
  roles: PlayerRole[];
  bowlingRole: BowlingRole;
  isWicketkeeper: boolean;
  isOverseas: boolean;
  season: number;
}

// A boss is a TeamStrength (used by the sim) plus its full XI (used by the preview UI).
export interface BossXi extends TeamStrength {
  players: BossPlayer[];
}

/** Build a boss from the best players available after skipping the top `skip` — so a larger skip
 *  yields a strong-but-lesser all-time side, giving the playoffs a real ramp. */
function boss(skip: number, name: string): BossXi {
  const slots = greedyXi(BY_OVR.slice(skip));
  const players: BossPlayer[] = slots
    .map((s) => (s.playerId ? PLAYER_SEASONS_BY_ID[s.playerId] : undefined))
    .filter((p): p is PlayerSeason => p != null)
    .map((p) => ({
      name: p.name,
      ovr: p.rating.ovr,
      roles: p.roles,
      bowlingRole: p.bowlingRole,
      isWicketkeeper: p.isWicketkeeper,
      isOverseas: p.isOverseas,
      season: Number(p.teamSeasonId.split("-").pop()) || 0,
    }));
  return {
    teamSeasonId: `ALLTIME_${skip}`,
    franchiseId: "ALLTIME",
    season: 0,
    name,
    ...strengthOf(slots),
    players,
  };
}

export const BOSS_QUALIFIER: BossXi = boss(70, "IPL All-Stars");
export const BOSS_SEMI_FINAL: BossXi = boss(28, "Hall of Fame XI");
export const BOSS_FINAL: BossXi = boss(0, "The All-Time XI");

// The three rounds of the gauntlet, in order — for the "who you're up against" preview.
export const GAUNTLET: { stage: "QUALIFIER" | "SEMI_FINAL" | "FINAL"; boss: BossXi }[] = [
  { stage: "QUALIFIER", boss: BOSS_QUALIFIER },
  { stage: "SEMI_FINAL", boss: BOSS_SEMI_FINAL },
  { stage: "FINAL", boss: BOSS_FINAL },
];
