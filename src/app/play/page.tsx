"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ALL_TEAM_SEASONS, PLAYER_SEASONS_BY_ID, playersForTeamSeason } from "@/engine/data/dataset";
import { getFranchise } from "@/engine/data/franchises";
import { buildWeightedPool, rerollTeam, rerollYear, spinWheel } from "@/engine/wheel";
import { createEmptyDraftState, movePlayer, placePlayer } from "@/engine/draft";
import { canAddPlayer, canPlaceInSlot, MAX_KEEPERS, MAX_OVERSEAS, roleLabel, validateXi, XI_SIZE } from "@/engine/rules";
import { computeTeamRating } from "@/engine/rating";
import { computeSeasonOdds } from "@/engine/odds";
import { simulateSeason } from "@/engine/sim";
import { buildVerdict } from "@/engine/verdict";
import { buildXiSeedKey } from "@/engine/rng";
import type { DraftState, PlayerSeason, SeasonResult, SimRosterPlayer, TeamSeason, Verdict } from "@/engine/types";
import { SpinReel } from "../components/SpinReel";
import { ThemeToggle } from "../components/ThemeToggle";
import { SeasonResultView } from "../components/SeasonResultView";
import { FranchiseCrest, PlayerAvatar } from "../components/Crest";
import { franchiseColor } from "../franchiseTheme";

function franchiseOf(teamSeasonId: string): string {
  return teamSeasonId.split("-")[0];
}
import { toDisplayRating } from "../displayRating";

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
  const isHard = searchParams.get("difficulty") === "hard";

  const playersById = useMemo(() => new Map(Object.entries(PLAYER_SEASONS_BY_ID)), []);

  const [draftState, setDraftState] = useState<DraftState>(() => createEmptyDraftState());
  const [pendingSpin, setPendingSpin] = useState<TeamSeason | null>(null);
  const [pendingPlayer, setPendingPlayer] = useState<PlayerSeason | null>(null);
  const [reorderFrom, setReorderFrom] = useState<number | null>(null);
  const [spinToken, setSpinToken] = useState(0);
  const [reelSettled, setReelSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seasonResult, setSeasonResult] = useState<SeasonResult | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "needsAuth" | "error">("idle");

  const filledSlots = draftState.slots.filter((s) => s.playerId != null);
  const filledCount = filledSlots.length;
  const isComplete = filledCount === XI_SIZE;
  const teamRating = computeTeamRating(draftState.slots, playersById);
  const validation = validateXi(draftState.slots, playersById);
  const odds = computeSeasonOdds(teamRating);

  const filledPlayers = filledSlots.map((s) => playersById.get(s.playerId!)!);
  const overseasCount = filledPlayers.filter((p) => p.isOverseas).length;
  const keeperCount = filledPlayers.filter((p) => p.isWicketkeeper).length;

  const hideSquadRatings = isHard;
  const hideTeamRatings = isHard && !isComplete;

  function handleSpin() {
    setError(null);
    setPendingPlayer(null);
    setReorderFrom(null);
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

    // Reorder: pick up a filled slot, then drop on another.
    if (slot.playerId == null) return;
    if (reorderFrom === null) {
      setReorderFrom(index);
      return;
    }
    if (reorderFrom === index) {
      setReorderFrom(null);
      return;
    }
    const moved = movePlayer(draftState, reorderFrom, index, playersById);
    if (moved === draftState) {
      setError("Can't swap those two — it would put a player out of position.");
    } else {
      setDraftState(moved);
      setError(null);
    }
    setReorderFrom(null);
  }

  function handleRerollTeam() {
    if (!pendingSpin || draftState.rerolls.teamRerollUsed) return;
    setPendingPlayer(null);
    setPendingSpin(rerollTeam(pendingSpin, ALL_TEAM_SEASONS, Math.random()));
    setSpinToken((t) => t + 1);
    setReelSettled(false);
    setDraftState({ ...draftState, rerolls: { ...draftState.rerolls, teamRerollUsed: true } });
  }

  function handleRerollYear() {
    if (!pendingSpin || draftState.rerolls.yearRerollUsed) return;
    setPendingPlayer(null);
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
          bat: p.rating.bat,
          bowl: p.rating.bowl,
          field: p.rating.field,
        };
      });
    const result = simulateSeason(seedKey, teamRating, roster);
    const v = buildVerdict(result);
    setSeasonResult(result);
    setVerdict(v);
    saveRun(result, v);
  }

  async function saveRun(result: SeasonResult, v: Verdict) {
    setSaveState("saving");
    const xi = draftState.slots
      .map((s) => (s.playerId ? playersById.get(s.playerId) : null))
      .filter((p): p is PlayerSeason => p != null)
      .map((p) => ({ name: p.name, ovr: p.rating.ovr }));
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          difficulty: isHard ? "hard" : "easy",
          tier: v.tier,
          finalRank: result.finalRank,
          points: result.points,
          wins: result.leagueStage.filter((m) => m.won).length,
          wonTitle: result.wonTitle,
          xi,
          detail: { result, verdict: v },
        }),
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
              <ThemeToggle />
              <button onClick={handleReset} className="font-mono text-xs underline-offset-2 hover:underline" style={{ color: "var(--ink-soft)" }}>
                Reset
              </button>
            </div>
          </div>
          <div className="rule-double mt-3" />
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[330px_1fr]">
          {/* ── Team sheet ──────────────────────────────────────── */}
          <aside className="sheet order-2 self-start p-5 md:order-1 md:sticky md:top-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl">Team sheet</h2>
              <span className="font-mono text-sm" style={{ color: "var(--ink-soft)" }}>
                {String(filledCount).padStart(2, "0")}/{XI_SIZE}
              </span>
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
              {pendingPlayer
                ? `Choose a position for ${pendingPlayer.name}.`
                : "Tap two filled positions to swap the order."}
            </p>

            <div className="mt-3 flex gap-2">
              <CountChip label="Overseas" count={overseasCount} max={MAX_OVERSEAS} />
              <CountChip label="Keeper" count={keeperCount} max={MAX_KEEPERS} />
            </div>

            <ol className="mt-4 space-y-1">
              {draftState.slots.map((slot) => {
                const player = slot.playerId ? playersById.get(slot.playerId) : null;
                const isReorder = reorderFrom === slot.index;
                const isLegalTarget = pendingPlayer != null && player == null && canPlaceInSlot(pendingPlayer, slot.index);
                const isBlockedTarget = pendingPlayer != null && player == null && !isLegalTarget;
                return (
                  <li key={slot.index}>
                    <button
                      onClick={() => handleSlotClick(slot.index)}
                      className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-all"
                      style={{
                        background: player ? "var(--paper-3)" : "transparent",
                        border: player
                          ? `1.5px solid ${isReorder ? "var(--spot)" : "transparent"}`
                          : `1.5px dashed ${isLegalTarget ? "var(--spot)" : "var(--rule)"}`,
                        opacity: isBlockedTarget ? 0.4 : 1,
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
                              {player.rating.ovr}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs" style={{ color: isLegalTarget ? "var(--spot)" : "var(--ink-faint)" }}>
                          {isLegalTarget ? "Place here ←" : "Empty"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>

            {!hideTeamRatings && (
              <div className="perforation mt-4 grid grid-cols-2 gap-x-4 gap-y-3 pt-4">
                <Stat label="Batting" value={toDisplayRating(teamRating.batting)} />
                <Stat label="Bowling" value={toDisplayRating(teamRating.bowling)} />
                <Stat label="Fielding" value={toDisplayRating(teamRating.fielding)} />
                <Stat label="Overall" value={toDisplayRating(teamRating.overall)} highlight />
              </div>
            )}

            {!validation.valid && filledCount > 0 && (
              <ul className="mt-3 space-y-1 text-xs" style={{ color: "var(--spot-deep)" }}>
                {validation.issues.map((issue, i) => (
                  <li key={i}>— {describeIssue(issue)}</li>
                ))}
              </ul>
            )}

            {isComplete && validation.valid && !seasonResult && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="perforation mt-4 space-y-2 pt-4">
                <Stat label="Projected finish" value={odds.projectedFinish} inline />
                <Stat label="Title odds" value={Math.round(odds.titleOdds * 100)} suffix="%" inline />
                <Stat label="Wooden spoon odds" value={Math.round(odds.wodenSpoonOdds * 100)} suffix="%" inline />
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSimulate}
                  className="font-display print-shadow mt-3 w-full py-3 text-lg"
                  style={{ background: "var(--spot)", color: "var(--spot-ink)" }}
                >
                  Play the season →
                </motion.button>
              </motion.div>
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
                onSave={() => saveRun(seasonResult, verdict)}
              />
            ) : !pendingSpin ? (
              <div className="sheet flex min-h-[420px] flex-col items-center justify-center gap-5 p-8 text-center">
                {isComplete ? (
                  <>
                    <span className="eyebrow">XI complete</span>
                    <p className="max-w-xs" style={{ color: "var(--ink-soft)" }}>
                      Your team sheet is full. Play the season from the panel on the left.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="eyebrow">Spin {String(filledCount + 1).padStart(2, "0")} of 11</span>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={handleSpin}
                      className="font-display print-shadow px-12 py-6 text-3xl"
                      style={{ background: "var(--ink)", color: "var(--paper-2)" }}
                    >
                      Spin the wheel
                    </motion.button>
                    <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                      A random franchise and a random season.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="sheet overflow-hidden">
                <div className="h-1.5 w-full" style={{ background: accent }} />
                <div className="p-5">
                  <SpinReel
                    candidates={ALL_TEAM_SEASONS}
                    result={pendingSpin}
                    spinToken={spinToken}
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
                              <motion.button
                                key={player.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18, delay: Math.min(i * 0.018, 0.28) }}
                                whileHover={check.allowed ? { y: -2 } : {}}
                                whileTap={check.allowed ? { scale: 0.99 } : {}}
                                onClick={() => handlePickPlayer(player)}
                                disabled={!check.allowed}
                                className="p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-35"
                                style={{
                                  background: isPicked ? "var(--ink)" : "var(--paper-2)",
                                  color: isPicked ? "var(--paper-2)" : "var(--ink)",
                                  borderLeft: `4px solid ${check.allowed ? accent : "var(--rule)"}`,
                                  borderTop: "1.5px solid var(--ink)",
                                  borderRight: "1.5px solid var(--ink)",
                                  borderBottom: "1.5px solid var(--ink)",
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <PlayerAvatar name={player.name} franchiseId={pendingSpin.franchiseId} size={28} />
                                  <span className="min-w-0 flex-1 truncate font-semibold">{player.name}</span>
                                  {!hideSquadRatings && (
                                    <span className="font-mono text-sm font-bold" style={{ color: isPicked ? "var(--paper-2)" : "var(--spot)" }}>
                                      {player.rating.ovr}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                  {player.roles.map((r) => (
                                    <RoleChip key={r} label={roleLabel(r)} inverted={isPicked} />
                                  ))}
                                  {player.isWicketkeeper && <RoleChip label="Keeper ✦" inverted={isPicked} spot />}
                                  {player.isOverseas && <RoleChip label="Overseas" inverted={isPicked} />}
                                  {player.limitedSample && <RoleChip label="Small sample" inverted={isPicked} faint />}
                                </div>
                                {!hideSquadRatings && (
                                  <div className="mt-1.5 font-mono text-xs" style={{ color: isPicked ? "var(--rule)" : "var(--ink-soft)" }}>
                                    {statsLine(player)}
                                  </div>
                                )}
                              </motion.button>
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

function CountChip({ label, count, max }: { label: string; count: number; max: number }) {
  const over = count > max;
  return (
    <span
      className="font-mono px-2 py-1 text-xs"
      style={{
        background: over ? "var(--spot-deep)" : "var(--paper-3)",
        color: over ? "var(--spot-ink)" : "var(--ink-soft)",
      }}
    >
      {label} {count}/{max}
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

function describeIssue(issue: ReturnType<typeof validateXi>["issues"][number]): string {
  switch (issue.code) {
    case "INCOMPLETE":
      return `${issue.filled}/${issue.required} positions filled`;
    case "TOO_MANY_OVERSEAS":
      return `${issue.count} overseas players (max ${issue.max})`;
    case "NO_WICKETKEEPER":
      return "No wicketkeeper drafted";
    case "TOO_MANY_WICKETKEEPERS":
      return `${issue.count} wicketkeepers (max ${MAX_KEEPERS})`;
    case "INSUFFICIENT_BOWLING":
      return `Only ${issue.bowlingOptions} bowling options (need ${issue.required})`;
  }
}
