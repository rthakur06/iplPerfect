"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ALL_TEAM_SEASONS, PLAYER_SEASONS_BY_ID, playersForTeamSeason } from "@/engine/data/dataset";
import { getFranchise } from "@/engine/data/franchises";
import { buildWeightedPool, rerollTeam, rerollYear, spinWheel } from "@/engine/wheel";
import { createEmptyDraftState, movePlayer, placePlayer } from "@/engine/draft";
import { canAddPlayer, canPlaceInSlot, MAX_OVERSEAS, roleLabel, validateXi, XI_SIZE } from "@/engine/rules";
import { computeTeamRating } from "@/engine/rating";
import { computeSeasonOdds } from "@/engine/odds";
import { simulateSeason } from "@/engine/sim";
import { buildVerdict } from "@/engine/verdict";
import { buildXiSeedKey } from "@/engine/rng";
import type { DraftState, PlayerSeason, SeasonOdds, SeasonResult, SimRosterPlayer, TeamSeason, Verdict, XiValidationIssue } from "@/engine/types";
import { SpinReel } from "../components/SpinReel";
import { GauntletModal } from "../components/GauntletModal";
import { ThemeToggle } from "../components/ThemeToggle";
import { SeasonResultView } from "../components/SeasonResultView";
import { FranchiseCrest, PlayerAvatar } from "../components/Crest";
import { franchiseColor } from "../franchiseTheme";

function franchiseOf(teamSeasonId: string): string {
  return teamSeasonId.split("-")[0];
}
import { toDisplayRating, toDisplayTeamRating } from "../displayRating";

const POOL = buildWeightedPool(ALL_TEAM_SEASONS);

function franchiseName(teamSeason: TeamSeason): string {
  return getFranchise(teamSeason.franchiseId)?.name ?? teamSeason.franchiseId;
}

function finishLabel(teamSeason: TeamSeason): string {
  const f = teamSeason.leagueFinish;
  switch (f.result) {
    case "CHAMPION":
      return "Champions";
    case "RUNNER_UP":
      return "Runners-up";
    case "PLAYOFFS":
      return `Playoffs · #${f.rank}`;
    case "LEAGUE_STAGE":
      return `Finished #${f.rank}`;
  }
}

function statsLine(player: PlayerSeason): string {
  const s = player.stats;
  const parts: string[] = [];
  if (s.ballsFaced > 0) {
    let bat = `${s.runs} runs · SR ${s.strikeRate}`;
    if (s.battingInnings >= 4) bat += ` · avg ${s.battingAverage}`;
    parts.push(bat);
  }
  if (s.oversBowled > 0) {
    parts.push(`${s.wickets} wkts · econ ${s.economy}`);
  }
  if (parts.length === 0) parts.push(`${s.catches} catches`);
  return parts.join("  ·  ");
}

export default function PlayPage() {
  return (
    <Suspense>
      <PlayScreen />
    </Suspense>
  );
}

function PlayScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Difficulty is chosen on the cover and fixed for the run — it can't change mid-draft.
  const isHard = searchParams.get("difficulty") === "hard";

  const playersById = useMemo(() => new Map(Object.entries(PLAYER_SEASONS_BY_ID)), []);

  const [draftState, setDraftState] = useState<DraftState>(() => createEmptyDraftState());
  const [pendingSpin, setPendingSpin] = useState<TeamSeason | null>(null);
  const [pendingPlayer, setPendingPlayer] = useState<PlayerSeason | null>(null);
  const [reorderFrom, setReorderFrom] = useState<number | null>(null);
  const [spinToken, setSpinToken] = useState(0);
  const [spinMode, setSpinMode] = useState<"both" | "team" | "year">("both");
  const [reelSettled, setReelSettled] = useState(false);
  // Drag-and-drop: what's being dragged (a freshly-drawn squad player, or an already-placed slot)
  // and which slot it's hovering over.
  const [dragInfo, setDragInfo] = useState<{ type: "squad"; player: PlayerSeason } | { type: "slot"; index: number } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const teamSheetRef = useRef<HTMLElement>(null);

  // On a narrow screen the team sheet sits below the squad list, so after you pick a player scroll
  // it into view — saves hunting for where to place them on mobile.
  useEffect(() => {
    if (!pendingPlayer) return;
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    teamSheetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pendingPlayer]);
  const [error, setError] = useState<string | null>(null);
  const [seasonResult, setSeasonResult] = useState<SeasonResult | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "needsAuth" | "error">("idle");
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const filledSlots = draftState.slots.filter((s) => s.playerId != null);
  const filledCount = filledSlots.length;
  const isComplete = filledCount === XI_SIZE;
  const teamRating = computeTeamRating(draftState.slots, playersById);
  const validation = validateXi(draftState.slots, playersById);
  const odds = computeSeasonOdds(teamRating);

  const filledPlayers = filledSlots.map((s) => playersById.get(s.playerId!)!);
  const overseasCount = filledPlayers.filter((p) => p.isOverseas).length;
  const keeperCount = filledPlayers.filter((p) => p.isWicketkeeper).length;
  const hasPace = filledPlayers.some((p) => p.bowlingRole === "PACE");
  const hasSpin = filledPlayers.some((p) => p.bowlingRole === "SPIN");

  // The player currently being placed — whether picked by tap (pendingPlayer) or held mid-drag.
  const draggingPlayer =
    dragInfo?.type === "squad"
      ? dragInfo.player
      : dragInfo?.type === "slot" && draftState.slots[dragInfo.index].playerId
        ? playersById.get(draftState.slots[dragInfo.index].playerId!) ?? null
        : null;
  const placing = pendingPlayer ?? draggingPlayer;

  const hideSquadRatings = isHard;
  const hideTeamRatings = isHard && !isComplete;

  function handleSpin() {
    setError(null);
    setPendingPlayer(null);
    setReorderFrom(null);
    setSpinMode("both");
    setPendingSpin(spinWheel(POOL, Math.random()));
    setSpinToken((t) => t + 1);
    setReelSettled(false);
  }

  function handlePickPlayer(player: PlayerSeason) {
    const check = canAddPlayer(player, draftState.slots, playersById);
    if (!check.allowed) {
      setError(check.reason ?? "Can't draft this player.");
      return;
    }
    setError(null);
    setReorderFrom(null);
    setPendingPlayer((prev) => (prev?.id === player.id ? null : player));
  }

  function handleSlotClick(index: number) {
    const slot = draftState.slots[index];

    // Placement: a player is picked and waiting for a position.
    if (pendingPlayer) {
      if (slot.playerId != null) {
        setError("That position is already taken.");
        return;
      }
      if (!canPlaceInSlot(pendingPlayer, index)) {
        setError(`${pendingPlayer.name} can't bat at No.${index + 1}.`);
        return;
      }
      const { state, placed } = placePlayer(draftState, pendingPlayer, playersById, index);
      if (placed) {
        setDraftState(state);
        setPendingPlayer(null);
        setPendingSpin(null);
        setReelSettled(false);
        setError(null);
      }
      return;
    }

    // Move/reorder: tap a filled slot to pick it up, then tap any slot (empty or filled) to drop it.
    if (reorderFrom === null) {
      if (slot.playerId == null) return; // nothing to pick up in an empty slot
      setReorderFrom(index);
      return;
    }
    if (reorderFrom === index) {
      setReorderFrom(null);
      return;
    }
    const moved = movePlayer(draftState, reorderFrom, index, playersById);
    if (moved === draftState) {
      setError("Can't move there — that player can't bat in that position.");
    } else {
      setDraftState(moved);
      setError(null);
    }
    setReorderFrom(null);
  }

  /** Drop a dragged player (a freshly-drawn squad pick or an already-placed slot) onto a slot. */
  function handleDropOnSlot(index: number) {
    const info = dragInfo;
    setDragInfo(null);
    setDragOverIndex(null);
    if (!info) return;

    if (info.type === "squad") {
      const { state, placed, reason } = placePlayer(draftState, info.player, playersById, index);
      if (placed) {
        setDraftState(state);
        setPendingPlayer(null);
        setPendingSpin(null);
        setReelSettled(false);
        setError(null);
      } else {
        setError(reason ?? "Can't place there.");
      }
      return;
    }

    if (info.index === index) return;
    const moved = movePlayer(draftState, info.index, index, playersById);
    if (moved === draftState) {
      setError("Can't move there — that player can't bat in that position.");
    } else {
      setDraftState(moved);
      setReorderFrom(null);
      setError(null);
    }
  }

  function handleRerollTeam() {
    if (!pendingSpin || draftState.rerolls.teamRerollUsed) return;
    setPendingPlayer(null);
    setSpinMode("team"); // only the team reel spins; the year stays put
    setPendingSpin(rerollTeam(pendingSpin, ALL_TEAM_SEASONS, Math.random()));
    setSpinToken((t) => t + 1);
    setReelSettled(false);
    setDraftState({ ...draftState, rerolls: { ...draftState.rerolls, teamRerollUsed: true } });
  }

  function handleRerollYear() {
    if (!pendingSpin || draftState.rerolls.yearRerollUsed) return;
    setPendingPlayer(null);
    setSpinMode("year"); // only the year reel spins; the team stays put
    setPendingSpin(rerollYear(pendingSpin, ALL_TEAM_SEASONS, Math.random()));
    setSpinToken((t) => t + 1);
    setReelSettled(false);
    setDraftState({ ...draftState, rerolls: { ...draftState.rerolls, yearRerollUsed: true } });
  }

  function handleSimulate() {
    const seedKey = buildXiSeedKey(draftState.slots.map((s) => s.playerId));
    const roster: SimRosterPlayer[] = draftState.slots
      .filter((s) => s.playerId != null)
      .map((s) => {
        const p = playersById.get(s.playerId!)!;
        return {
          id: p.id,
          name: p.name,
          slotIndex: s.index,
          bowls: p.bowlingRole !== "NONE",
          bowlType: p.bowlingRole,
          bat: p.rating.bat,
          bowl: p.rating.bowl,
          field: p.rating.field,
        };
      });
    const result = simulateSeason(seedKey, teamRating, roster);
    const v = buildVerdict(result);
    setSeasonResult(result);
    setVerdict(v);
    saveRun();
  }

  // Only the XI + difficulty are sent; the server re-simulates to derive the result authoritatively
  // (so the leaderboard can't be spoofed). The local result shown to the player matches because the
  // sim is deterministic from the same ordered XI.
  async function saveRun() {
    setSaveState("saving");
    const playerIds = draftState.slots.map((s) => s.playerId);
    if (playerIds.some((id) => id == null)) return;
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty: isHard ? "hard" : "easy", playerIds }),
      });
      if (res.status === 401) setSaveState("needsAuth");
      else if (res.ok) setSaveState("saved");
      else setSaveState("error");
    } catch {
      setSaveState("error");
    }
  }

  function handleReset() {
    setDraftState(createEmptyDraftState());
    setPendingSpin(null);
    setPendingPlayer(null);
    setReorderFrom(null);
    setReelSettled(false);
    setSeasonResult(null);
    setVerdict(null);
    setError(null);
    setSaveState("idle");
  }

  // Hard mode sorts alphabetically so the ordering can't betray who the best player is; easy mode
  // sorts by rating for convenience.
  const squad = pendingSpin
    ? [...playersForTeamSeason(pendingSpin.id)].sort((a, b) =>
        isHard ? a.name.localeCompare(b.name) : b.rating.ovr - a.rating.ovr
      )
    : [];
  const accent = pendingSpin ? franchiseColor(pendingSpin.franchiseId) : "var(--spot)";

  return (
    <div className="relative min-h-screen px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        {/* ── Masthead ──────────────────────────────────────────── */}
        <header className="mb-5">
          <div className="flex items-center justify-between">
            <Link href="/" className="font-display text-2xl sm:text-3xl leading-none">
              IPL Perfect Season
            </Link>
            <div className="flex items-center gap-3">
              <span className="eyebrow border border-[var(--ink)] px-2 py-1">{isHard ? "Hard" : "Easy"} mode</span>
              <Link href="/leaderboard" className="font-mono text-xs" style={{ color: "var(--spot-2-deep)" }}>
                Leaderboard
              </Link>
              <ThemeToggle />
              <button onClick={() => setShowResetConfirm(true)} className="font-mono text-xs underline-offset-2 hover:underline" style={{ color: "var(--ink-soft)" }}>
                Reset
              </button>
            </div>
          </div>
          <div className="rule-double mt-3" />
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[330px_1fr]">
          {/* ── Team sheet ──────────────────────────────────────── */}
          <aside ref={teamSheetRef} className="sheet order-2 self-start p-5 md:order-1 md:sticky md:top-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl">Team sheet</h2>
              <span className="font-mono text-sm" style={{ color: "var(--ink-soft)" }}>
                {String(filledCount).padStart(2, "0")}/{XI_SIZE}
              </span>
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
              {pendingPlayer
                ? `Drag or tap a position for ${pendingPlayer.name}.`
                : "Drag a player to an open spot, or tap two to swap."}
            </p>

            <div className="mt-3 flex gap-2">
              <CountChip label="Overseas" count={overseasCount} max={MAX_OVERSEAS} />
              <CountChip label="Keeper" count={keeperCount} min={1} />
            </div>

            <ol className="mt-4 space-y-1">
              {draftState.slots.map((slot) => {
                const player = slot.playerId ? playersById.get(slot.playerId) : null;
                const isReorder = reorderFrom === slot.index;
                // The player being placed via either flow (a tapped pick or a dragged item).
                const isLegalTarget = placing != null && player == null && canPlaceInSlot(placing, slot.index);
                const isBlockedTarget = placing != null && player == null && !isLegalTarget;
                const isDragOver = dragOverIndex === slot.index && dragInfo != null;
                return (
                  <li key={slot.index}>
                    <button
                      onClick={() => handleSlotClick(slot.index)}
                      draggable={player != null}
                      onDragStart={(e) => {
                        if (player == null) return;
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", `slot:${slot.index}`);
                        setReorderFrom(null);
                        setDragInfo({ type: "slot", index: slot.index });
                      }}
                      onDragOver={(e) => {
                        if (!dragInfo) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverIndex !== slot.index) setDragOverIndex(slot.index);
                      }}
                      onDragLeave={() => {
                        if (dragOverIndex === slot.index) setDragOverIndex(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropOnSlot(slot.index);
                      }}
                      onDragEnd={() => {
                        setDragInfo(null);
                        setDragOverIndex(null);
                      }}
                      className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-all"
                      style={{
                        background: isDragOver ? "var(--paper-2)" : player ? "var(--paper-3)" : "transparent",
                        border: player
                          ? `1.5px solid ${isReorder || isDragOver ? "var(--spot)" : "transparent"}`
                          : `1.5px dashed ${isLegalTarget || isDragOver ? "var(--spot)" : "var(--rule)"}`,
                        boxShadow: isDragOver ? "2px 2px 0 var(--spot-2)" : "none",
                        opacity: isBlockedTarget ? 0.4 : 1,
                        cursor: player ? "grab" : "default",
                      }}
                    >
                      <span className="font-mono text-xs w-5 shrink-0" style={{ color: "var(--ink-faint)" }}>
                        {String(slot.index + 1).padStart(2, "0")}
                      </span>
                      {player ? (
                        <>
                          <FranchiseCrest franchiseId={franchiseOf(player.teamSeasonId)} size={16} />
                          {player.isWicketkeeper && <span className="text-xs">✦</span>}
                          <span className="flex-1 truncate text-sm">{player.name}</span>
                          {!hideSquadRatings && (
                            <span className="font-mono text-xs font-bold" style={{ color: "var(--spot)" }}>
                              {toDisplayRating(player.rating.ovr)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs" style={{ color: isLegalTarget ? "var(--spot)" : "var(--ink-faint)" }}>
                          {isLegalTarget ? "Drop here ←" : "Empty"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>

            {!hideTeamRatings && (
              <div className="perforation mt-4 grid grid-cols-2 gap-x-4 gap-y-3 pt-4">
                <Stat label="Batting" value={toDisplayTeamRating(teamRating.batting)} />
                <Stat label="Bowling" value={toDisplayTeamRating(teamRating.bowling)} />
                <Stat label="Fielding" value={toDisplayTeamRating(teamRating.fielding)} />
                <Stat label="Overall" value={toDisplayTeamRating(teamRating.overall)} highlight />
              </div>
            )}

            {!validation.valid && filledCount > 0 && (
              <ul className="mt-3 space-y-1 text-xs" style={{ color: "var(--spot-deep)" }}>
                {validation.issues.map((issue, i) => (
                  <li key={i}>— {describeIssue(issue)}</li>
                ))}
              </ul>
            )}
          </aside>

          {/* ── Draft floor ─────────────────────────────────────── */}
          <main className="order-1 md:order-2">
            {seasonResult && verdict ? (
              <SeasonResultView
                result={seasonResult}
                verdict={verdict}
                onDraftAgain={handleReset}
                saveState={saveState}
                onSave={() => saveRun()}
              />
            ) : !pendingSpin ? (
              isComplete ? (
                <ScoutingReport
                  valid={validation.valid}
                  issues={validation.issues}
                  odds={odds}
                  overall={toDisplayTeamRating(teamRating.overall)}
                  hasPace={hasPace}
                  hasSpin={hasSpin}
                  onSimulate={handleSimulate}
                />
              ) : (
                <div className="sheet flex min-h-[420px] flex-col items-center justify-center gap-5 p-8 text-center">
                  <span className="eyebrow" style={{ color: "var(--spot-2-deep)" }}>
                    Spin {String(filledCount + 1).padStart(2, "0")} of 11
                  </span>
                  <motion.button
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleSpin}
                    className="btn-primary font-display px-12 py-6 text-3xl"
                  >
                    Spin the wheel
                  </motion.button>
                  <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                    A random franchise and a random season.
                  </p>
                </div>
              )
            ) : (
              <div className="sheet overflow-hidden">
                {/* Stay neutral while spinning so the bar doesn't give away the franchise early. */}
                <div
                  className="h-1.5 w-full"
                  style={{ background: reelSettled ? accent : "var(--rule)", transition: "background 0.4s ease" }}
                />
                <div className="p-5">
                  <SpinReel
                    candidates={ALL_TEAM_SEASONS}
                    result={pendingSpin}
                    spinToken={spinToken}
                    spinMode={spinMode}
                    onSettled={() => setReelSettled(true)}
                  />

                  <AnimatePresence>
                    {reelSettled && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                        <div className="mt-5 flex items-end justify-between gap-3">
                          <div>
                            <span className="eyebrow">You drew</span>
                            <div className="mt-1 flex items-center gap-2">
                              <FranchiseCrest franchiseId={pendingSpin.franchiseId} size={30} />
                              <h2 className="font-display text-2xl leading-none sm:text-3xl">{franchiseName(pendingSpin)}</h2>
                            </div>
                            <p className="mt-1 font-mono text-sm" style={{ color: "var(--ink-soft)" }}>
                              {pendingSpin.season} · {finishLabel(pendingSpin)}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <RerollButton label="Reroll team" used={draftState.rerolls.teamRerollUsed} onClick={handleRerollTeam} />
                            <RerollButton label="Reroll year" used={draftState.rerolls.yearRerollUsed} onClick={handleRerollYear} />
                          </div>
                        </div>

                        <AnimatePresence>
                          {error && (
                            <motion.p
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-3 px-3 py-2 text-sm"
                              style={{ color: "var(--spot-ink)", background: "var(--spot-deep)" }}
                            >
                              {error}
                            </motion.p>
                          )}
                        </AnimatePresence>

                        <div className="mt-4 flex items-baseline justify-between">
                          <span className="eyebrow">Pick one player</span>
                          {pendingPlayer && (
                            <button
                              onClick={() => setPendingPlayer(null)}
                              className="font-mono text-xs underline underline-offset-2"
                              style={{ color: "var(--spot)" }}
                            >
                              picking {pendingPlayer.name} — cancel
                            </button>
                          )}
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {squad.map((player, i) => {
                            const check = canAddPlayer(player, draftState.slots, playersById);
                            const isPicked = pendingPlayer?.id === player.id;
                            return (
                              <motion.div
                                key={player.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18, delay: Math.min(i * 0.018, 0.28) }}
                              >
                              <button
                                onClick={() => handlePickPlayer(player)}
                                disabled={!check.allowed}
                                draggable={check.allowed}
                                onDragStart={(e) => {
                                  if (!check.allowed) return;
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", `squad:${player.id}`);
                                  setError(null);
                                  setDragInfo({ type: "squad", player });
                                }}
                                onDragEnd={() => {
                                  setDragInfo(null);
                                  setDragOverIndex(null);
                                }}
                                className="card-interactive block w-full p-3 text-left disabled:cursor-not-allowed disabled:opacity-35"
                                style={{
                                  background: isPicked ? "var(--ink)" : "var(--paper-2)",
                                  color: isPicked ? "var(--paper-2)" : "var(--ink)",
                                  borderLeft: `4px solid ${check.allowed ? accent : "var(--rule)"}`,
                                  borderTop: "1.5px solid var(--ink)",
                                  borderRight: "1.5px solid var(--ink)",
                                  borderBottom: "1.5px solid var(--ink)",
                                  cursor: check.allowed ? "grab" : "not-allowed",
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <PlayerAvatar name={player.name} franchiseId={pendingSpin.franchiseId} size={28} />
                                  <span className="min-w-0 flex-1 truncate font-semibold">{player.name}</span>
                                  {!hideSquadRatings && (
                                    <span className="flex shrink-0 items-baseline gap-1">
                                      <span className="font-mono text-[9px] uppercase tracking-wide" style={{ color: isPicked ? "var(--rule)" : "var(--ink-faint)" }}>
                                        ovr
                                      </span>
                                      <span className="font-mono text-base font-bold leading-none" style={{ color: isPicked ? "var(--paper-2)" : "var(--spot)" }}>
                                        {toDisplayRating(player.rating.ovr)}
                                      </span>
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                  {player.roles.map((r) => (
                                    <RoleChip key={r} label={roleLabel(r)} inverted={isPicked} />
                                  ))}
                                  {player.bowlingRole !== "NONE" && (
                                    <RoleChip label={player.bowlingRole === "SPIN" ? "Spin" : "Pace"} inverted={isPicked} />
                                  )}
                                  {player.isWicketkeeper && <RoleChip label="Keeper ✦" inverted={isPicked} spot />}
                                  {player.isOverseas && <RoleChip label="Overseas" inverted={isPicked} />}
                                  {player.limitedSample && <RoleChip label="Small sample" inverted={isPicked} faint />}
                                </div>
                                {!hideSquadRatings && (
                                  <>
                                    {/* The OVR broken into what it's actually built from this season. */}
                                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] uppercase tracking-wide" style={{ color: isPicked ? "var(--rule)" : "var(--ink-faint)" }}>
                                      <span>Bat <span style={{ color: isPicked ? "var(--paper-2)" : "var(--ink)" }}>{toDisplayRating(player.rating.bat)}</span></span>
                                      {player.bowlingRole !== "NONE" && (
                                        <span>Bowl <span style={{ color: isPicked ? "var(--paper-2)" : "var(--ink)" }}>{toDisplayRating(player.rating.bowl)}</span></span>
                                      )}
                                      <span>Field <span style={{ color: isPicked ? "var(--paper-2)" : "var(--ink)" }}>{toDisplayRating(player.rating.field)}</span></span>
                                    </div>
                                    <div className="mt-1 font-mono text-xs" style={{ color: isPicked ? "var(--rule)" : "var(--ink-soft)" }}>
                                      {statsLine(player)}
                                    </div>
                                  </>
                                )}
                              </button>
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(12, 14, 16, 0.6)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowResetConfirm(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Reset draft"
          >
            <motion.div
              className="sheet print-shadow w-full max-w-sm p-6"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display text-2xl">Reset draft?</h2>
              <p className="mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>
                This clears your current XI and takes you back to the start to pick a mode. You
                can&rsquo;t undo it.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="font-display flex-1 py-2.5 text-base"
                  style={{ border: "1.5px solid var(--ink)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleReset();
                    router.push("/");
                  }}
                  className="font-display flex-1 py-2.5 text-base"
                  style={{ background: "var(--spot-deep)", color: "var(--spot-ink)" }}
                >
                  Reset
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RoleChip({ label, inverted, spot, faint }: { label: string; inverted?: boolean; spot?: boolean; faint?: boolean }) {
  return (
    <span
      className="font-mono px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
      style={{
        background: spot ? "var(--spot)" : inverted ? "rgba(246,239,224,0.16)" : "var(--paper-3)",
        color: spot ? "var(--spot-ink)" : faint ? (inverted ? "var(--rule)" : "var(--ink-faint)") : inverted ? "var(--paper-2)" : "var(--ink-soft)",
      }}
    >
      {label}
    </span>
  );
}

function RerollButton({ label, used, onClick }: { label: string; used: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={used}
      className="font-mono px-2.5 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30"
      style={{ border: "1.5px solid var(--ink)" }}
    >
      {used ? `${label} ✕` : label}
    </button>
  );
}

function CountChip({ label, count, max, min }: { label: string; count: number; max?: number; min?: number }) {
  const bad = (max != null && count > max) || (min != null && count < min);
  const suffix = max != null ? `/${max}` : min != null ? ` (min ${min})` : "";
  return (
    <span
      className="font-mono px-2 py-1 text-xs"
      style={{
        background: bad ? "var(--spot-deep)" : "var(--paper-3)",
        color: bad ? "var(--spot-ink)" : "var(--ink-soft)",
      }}
    >
      {label} {count}{suffix}
    </span>
  );
}

function Stat({
  label,
  value,
  highlight,
  suffix,
  inline,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  suffix?: string;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className="flex items-baseline justify-between">
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {label}
        </span>
        <span className="font-mono text-sm font-bold">
          {value}
          {suffix ?? ""}
        </span>
      </div>
    );
  }
  return (
    <div>
      <div className="eyebrow" style={{ letterSpacing: "0.12em" }}>
        {label}
      </div>
      <div className="font-display text-2xl leading-none" style={{ color: highlight ? "var(--spot)" : "var(--ink)" }}>
        {value}
        {suffix ?? ""}
      </div>
    </div>
  );
}

function formatOdds(p: number): string {
  const pct = p * 100;
  if (pct >= 99.5) return ">99%";
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

/** The pre-season "scouting report": projections for a complete XI, with the simulate button under
 *  them. A full-but-illegal XI (e.g. no wicketkeeper) shows what's left to fix instead. */
function ScoutingReport({
  valid,
  issues,
  odds,
  overall,
  hasPace,
  hasSpin,
  onSimulate,
}: {
  valid: boolean;
  issues: XiValidationIssue[];
  odds: SeasonOdds;
  overall: number;
  hasPace: boolean;
  hasSpin: boolean;
  onSimulate: () => void;
}) {
  const [showGauntlet, setShowGauntlet] = useState(false);
  const attackWarning = !hasSpin
    ? "No frontline spinner — you'll be exposed on turning pitches."
    : !hasPace
      ? "No seamer — green tops will catch your attack out."
      : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="sheet print-shadow overflow-hidden"
    >
      <div className="h-1.5 w-full" style={{ background: valid ? "var(--spot)" : "var(--rule)" }} />
      <div className="p-6 sm:p-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="eyebrow">Scouting report</span>
            <h2 className="font-display mt-1 text-3xl leading-none sm:text-4xl">
              {valid ? "Pre-season projection" : "Almost a legal XI"}
            </h2>
          </div>
          <div className="shrink-0 text-right">
            <div className="eyebrow" style={{ letterSpacing: "0.12em" }}>
              Overall
            </div>
            <div className="font-display text-4xl leading-none" style={{ color: "var(--spot)" }}>
              {overall}
            </div>
          </div>
        </div>

        <div className="rule-double my-5" />

        {valid ? (
          <>
            <p className="mb-4 max-w-md text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              Projected results for this XI over a 14-game league and the playoffs. The title means
              winning three knockouts against all-time great sides, so it&rsquo;s a tall order even for a
              strong team.
            </p>
            <div className="grid grid-cols-2 gap-px overflow-hidden" style={{ background: "var(--rule)", border: "1.5px solid var(--ink)" }}>
              <OddsCell label="Projected finish" value={`#${odds.projectedFinish}`} />
              <OddsCell label="Expected points" value={`${odds.expectedPoints}`} />
              <OddsCell label="Playoff chance" value={formatOdds(odds.playoffOdds)} color="var(--spot)" />
              <OddsCell label="Unbeaten chance" value={formatOdds(odds.unbeatenOdds)} color="var(--pitch)" />
              <OddsCell label="Title chance" value={formatOdds(odds.titleOdds)} color="var(--spot-2)" wide />
            </div>
            {attackWarning && (
              <p className="mt-4 px-3 py-2 text-xs" style={{ background: "var(--paper-3)", color: "var(--spot-2-deep)" }}>
                ⚠ {attackWarning}
              </p>
            )}
            <button
              onClick={() => setShowGauntlet(true)}
              className="font-mono mt-3 w-full py-2.5 text-xs uppercase tracking-wide"
              style={{ border: "1.5px solid var(--ink)", color: "var(--spot)" }}
            >
              See who you&rsquo;ll face in the playoffs →
            </button>
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={onSimulate}
              className="btn-primary font-display mt-3 w-full py-4 text-2xl"
            >
              Simulate the season →
            </motion.button>
            <AnimatePresence>
              {showGauntlet && <GauntletModal yourOverall={overall} onClose={() => setShowGauntlet(false)} />}
            </AnimatePresence>
          </>
        ) : (
          <>
            <p className="mb-3 max-w-md text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              Your team sheet is full, but it isn&rsquo;t a legal XI yet. Sort these out before you can
              play the season:
            </p>
            <ul className="space-y-2">
              {issues.map((issue, i) => (
                <li
                  key={i}
                  className="flex gap-2 px-3 py-2 text-sm"
                  style={{ background: "var(--paper-3)", color: "var(--spot-deep)" }}
                >
                  <span style={{ color: "var(--spot)" }}>■</span>
                  <span>{describeIssue(issue)}</span>
                </li>
              ))}
            </ul>
            <p className="font-mono mt-4 text-xs" style={{ color: "var(--ink-faint)" }}>
              Tap a drafted player in the team sheet to swap them, then spin for a replacement.
            </p>
          </>
        )}
      </div>
    </motion.div>
  );
}

function OddsCell({ label, value, color, wide }: { label: string; value: string; color?: string; wide?: boolean }) {
  return (
    <div className={`p-4 ${wide ? "col-span-2" : ""}`} style={{ background: "var(--paper-2)" }}>
      <div className="eyebrow" style={{ letterSpacing: "0.1em" }}>
        {label}
      </div>
      <div className="font-display mt-1 text-3xl leading-none" style={{ color: color ?? "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

function describeIssue(issue: ReturnType<typeof validateXi>["issues"][number]): string {
  switch (issue.code) {
    case "INCOMPLETE":
      return `${issue.filled}/${issue.required} positions filled`;
    case "TOO_MANY_OVERSEAS":
      return `${issue.count} overseas players (max ${issue.max})`;
    case "NO_WICKETKEEPER":
      return "No wicketkeeper drafted";
    case "INSUFFICIENT_BOWLING":
      return `Only ${issue.bowlingOptions} bowling options (need ${issue.required})`;
  }
}
