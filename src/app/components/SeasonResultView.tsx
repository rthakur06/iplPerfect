"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";
import type { MatchResult, PlayoffMatchResult, PlayoffStage, SeasonResult, SimPlayerStat, Verdict } from "@/engine/types";
import { TIER_THEME } from "../tierTheme";
import { useAuth } from "./AuthProvider";
import { SignInModal } from "./SignInModal";

export type SaveState = "idle" | "saving" | "saved" | "needsAuth" | "error";

const PLAYOFF_STAGE_LABEL: Record<PlayoffStage, string> = {
  QUALIFIER: "Qualifier",
  SEMI_FINAL: "Semi-final",
  FINAL: "Final",
};

const LEAGUE_REVEAL_MS = 1200; // league games tick by at a readable pace
const INNINGS_MS = 1500; // playoffs go slower — inning by inning

function opponentLabel(m: MatchResult): string {
  return m.opponentSeason > 0 ? `${m.opponentName} '${String(m.opponentSeason).slice(2)}` : m.opponentName;
}

export function SeasonResultView({
  result,
  verdict,
  onDraftAgain,
  onClose,
  saveState,
  onSave,
  instant = false,
}: {
  result: SeasonResult;
  verdict: Verdict;
  onDraftAgain?: () => void;
  onClose?: () => void;
  saveState?: SaveState;
  onSave?: () => void;
  instant?: boolean;
}) {
  const theme = TIER_THEME[verdict.tier];
  const { user } = useAuth();
  const [showSignIn, setShowSignIn] = useState(false);

  const league = result.leagueStage;
  const playoffs = result.playoffStage;
  const hasPlayoffs = playoffs.length > 0;

  // ── League reveal (auto, brisk) ──
  const [leagueRevealed, setLeagueRevealed] = useState(instant ? league.length : 0);
  const leagueDone = leagueRevealed >= league.length;

  useEffect(() => {
    if (leagueRevealed >= league.length) return;
    const t = setTimeout(() => setLeagueRevealed((r) => r + 1), LEAGUE_REVEAL_MS);
    return () => clearTimeout(t);
  }, [leagueRevealed, league.length]);

  // ── Playoffs (button-gated, slower) ──
  const [enteredPlayoffs, setEnteredPlayoffs] = useState(instant);
  const [playoffShown, setPlayoffShown] = useState(instant ? playoffs.length : 0);
  const [revealing, setRevealing] = useState(false);

  const prevWon = playoffShown === 0 || playoffs[playoffShown - 1]?.won;
  const moreToPlay = playoffShown < playoffs.length && prevWon;
  const playoffsResolved = !hasPlayoffs || !enteredPlayoffs ? false : playoffShown >= playoffs.length || !prevWon;

  // The whole thing is "done" (show verdict) when the league is in and there are either no playoffs
  // to play, or the gauntlet has resolved.
  const done = instant || (leagueDone && (!hasPlayoffs ? true : enteredPlayoffs && playoffsResolved));

  // Confetti once a Perfect Season fully reveals.
  useEffect(() => {
    if (!done || verdict.easterEgg !== "GOAT") return;
    let frame = 0;
    const colors = [theme.accent, "#1b1712", "var(--spot)"];
    const interval = setInterval(() => {
      confetti({ particleCount: 60, spread: 100, startVelocity: 45, origin: { y: 0.3 }, colors });
      frame++;
      if (frame >= 3) clearInterval(interval);
    }, 350);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, verdict.easterEgg]);

  // Retry the save once the user signs in from the nudge.
  useEffect(() => {
    if (user && saveState === "needsAuth") onSave?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const wins = league.filter((m) => m.won).length;
  const draws = league.filter((m) => m.tied).length;
  const losses = league.length - wins - draws;
  const runsFor = league.reduce((s, m) => s + m.yourScore.runs, 0);
  const runsAgainst = league.reduce((s, m) => s + m.theirScore.runs, 0);
  const leaders = useMemo(() => computeLeaders(result.playerStats), [result.playerStats]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="sheet print-shadow overflow-hidden"
    >
      <div className="h-2 w-full" style={{ background: done ? theme.accent : "var(--rule)" }} />
      <div className="p-6 sm:p-8">
        {/* ── Header ── */}
        {done ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <span className="eyebrow inline-block px-2 py-1" style={{ background: theme.badgeBg, color: theme.accent, letterSpacing: "0.16em" }}>
              Final verdict
            </span>
            <h2 className="font-display mt-3 text-4xl leading-none sm:text-5xl" style={{ color: theme.accent }}>
              {verdict.tier === "PERFECT_SEASON" ? "Perfect Season ★" : theme.label}
            </h2>
            <p className="mt-3 max-w-lg leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              {verdict.verdictLine}
            </p>
          </motion.div>
        ) : !leagueDone ? (
          <div className="flex items-center justify-between">
            <div>
              <span className="eyebrow">Simulating season</span>
              <h2 className="font-display mt-1 text-3xl leading-none">
                Matchweek {Math.min(leagueRevealed + 1, league.length)}
                <span style={{ color: "var(--ink-faint)" }}>/{league.length}</span>
              </h2>
            </div>
            <button onClick={() => setLeagueRevealed(league.length)} className="font-mono px-3 py-2 text-xs" style={{ border: "1.5px solid var(--ink)" }}>
              Skip →
            </button>
          </div>
        ) : (
          <div>
            <span className="eyebrow">League stage complete</span>
            <h2 className="font-display mt-1 text-3xl leading-none">
              {wins}–{losses}
              {draws > 0 ? `–${draws}` : ""} · {result.points} pts
            </h2>
          </div>
        )}

        <div className="rule-double my-5" />

        {/* ── League game feed (newest first) ── */}
        <div className="mb-5 flex flex-col gap-px" style={{ background: "var(--rule)" }}>
          <AnimatePresence initial={false}>
            {Array.from({ length: leagueRevealed }, (_, i) => leagueRevealed - 1 - i).map((idx) => (
              <motion.div key={idx} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <MatchRow match={league[idx]} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ── Between league and playoffs ── */}
        {leagueDone && !done && (
          <>
            {/* W / D / L / Pts */}
            <div className="mb-4 grid grid-cols-4 gap-px overflow-hidden" style={{ background: "var(--rule)", border: "1.5px solid var(--ink)" }}>
              <Tally label="Won" value={wins} color="var(--pitch)" />
              <Tally label="Drawn" value={draws} />
              <Tally label="Lost" value={losses} color="var(--spot-deep)" />
              <Tally label="Pts" value={result.points} color="var(--spot)" />
            </div>

            {hasPlayoffs && !enteredPlayoffs && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setEnteredPlayoffs(true)}
                className="font-display print-shadow w-full py-4 text-xl"
                style={{ background: "var(--spot)", color: "var(--spot-ink)" }}
              >
                Advance to the playoffs →
              </motion.button>
            )}
          </>
        )}

        {/* ── Playoff gauntlet, game by game ── */}
        {enteredPlayoffs && hasPlayoffs && (
          <div className="mb-5">
            <span className="eyebrow">The gauntlet · beat the best sides ever built</span>
            <div className="mt-2 flex flex-col gap-2">
              {playoffs.slice(0, playoffShown).map((m, i) => (
                <PlayoffGameCard key={i} match={m} revealed />
              ))}

              {revealing && playoffs[playoffShown] && (
                <PlayoffGameCard
                  match={playoffs[playoffShown]}
                  onDone={() => {
                    setPlayoffShown((n) => n + 1);
                    setRevealing(false);
                  }}
                />
              )}

              {!revealing && moreToPlay && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setRevealing(true)}
                  className="font-display w-full py-3 text-lg"
                  style={{ border: "1.5px solid var(--ink)", color: "var(--spot)" }}
                >
                  Play the {PLAYOFF_STAGE_LABEL[playoffs[playoffShown].stage]} →
                </motion.button>
              )}
            </div>
          </div>
        )}

        {/* ── Final summary, leaders, actions ── */}
        {done && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="grid grid-cols-4 gap-px overflow-hidden" style={{ background: "var(--rule)", border: "1.5px solid var(--ink)" }}>
              <Tally label="Won" value={wins} color="var(--pitch)" />
              <Tally label="Drawn" value={draws} />
              <Tally label="Lost" value={losses} color="var(--spot-deep)" />
              <Tally label="Pts" value={result.points} color="var(--spot)" />
            </div>
            <p className="font-mono mt-2 text-center text-xs" style={{ color: "var(--ink-faint)" }}>
              Runs for {runsFor} · against {runsAgainst} · NRR {result.netRunRate >= 0 ? "+" : ""}
              {result.netRunRate.toFixed(1)} · finished #{result.finalRank}
            </p>

            {leaders.length > 0 && (
              <div className="mt-6">
                <span className="eyebrow">Season leaders · your XI</span>
                <div className="mt-2 grid grid-cols-2 gap-px sm:grid-cols-3" style={{ background: "var(--rule)" }}>
                  {leaders.map((l) => (
                    <div key={l.label} className="p-3" style={{ background: "var(--paper-2)" }}>
                      <div className="eyebrow" style={{ letterSpacing: "0.1em" }}>{l.label}</div>
                      <div className="mt-1 truncate text-sm font-semibold">{l.name}</div>
                      <div className="font-mono text-xs" style={{ color: "var(--spot)" }}>{l.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {verdict.badges.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {verdict.badges.map((b) => (
                  <span key={b} className="font-mono px-2.5 py-1 text-xs" style={{ background: "var(--paper-3)", color: "var(--ink-soft)" }}>
                    {b}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {onClose && (
                <button onClick={onClose} className="font-display px-6 py-3 text-lg" style={{ border: "1.5px solid var(--ink)" }}>
                  Close
                </button>
              )}
              {onDraftAgain && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={onDraftAgain} className="font-display px-6 py-3 text-lg" style={{ border: "1.5px solid var(--ink)" }}>
                  Draft again
                </motion.button>
              )}
              {saveState === "saving" && <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Saving run…</span>}
              {saveState === "saved" && <span className="font-mono text-xs" style={{ color: "var(--pitch)" }}>✓ Saved to your runs</span>}
              {saveState === "error" && <span className="font-mono text-xs" style={{ color: "var(--spot-deep)" }}>Couldn&rsquo;t save this run.</span>}
              {saveState === "needsAuth" && !user && (
                <button onClick={() => setShowSignIn(true)} className="font-mono text-xs underline underline-offset-2" style={{ color: "var(--spot)" }}>
                  Sign in to save this run →
                </button>
              )}
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>{showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}</AnimatePresence>
    </motion.div>
  );
}

/** A playoff game revealed inning by inning. If `revealed`, it shows fully at once (already played). */
function PlayoffGameCard({ match, onDone, revealed }: { match: PlayoffMatchResult; onDone?: () => void; revealed?: boolean }) {
  const [step, setStep] = useState(revealed ? 3 : 0);

  useEffect(() => {
    if (revealed) return;
    if (step >= 3) return;
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 350 : INNINGS_MS);
    return () => clearTimeout(t);
  }, [step, revealed]);

  useEffect(() => {
    if (!revealed && step >= 3) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const outcome = match.won ? "WON" : match.tied ? "TIED" : "LOST";
  const outColor = match.won ? "var(--pitch)" : match.tied ? "var(--ink-soft)" : "var(--spot-deep)";

  return (
    <div className="p-3" style={{ background: "var(--paper-2)", border: "1.5px solid var(--ink)" }}>
      <div className="flex items-center justify-between">
        <span className="font-display text-lg leading-none" style={{ color: "var(--spot)" }}>
          {PLAYOFF_STAGE_LABEL[match.stage]}
        </span>
        <span className="text-sm font-semibold">{opponentLabel(match)}</span>
      </div>
      <div className="font-mono mt-2 space-y-1 text-sm">
        <AnimatePresence>
          {step >= 1 && (
            <motion.div key="i1" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
              <span>1st innings · {match.opponentName}</span>
              <span>{match.theirScore.runs}/{match.theirScore.wickets}</span>
            </motion.div>
          )}
          {step >= 2 && (
            <motion.div key="i2" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex justify-between">
              <span>2nd innings · You</span>
              <span>{match.yourScore.runs}/{match.yourScore.wickets}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {step >= 3 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
          <span className="font-display inline-block px-2 py-0.5 text-sm" style={{ background: outColor, color: "var(--paper-2)" }}>
            {outcome}
          </span>
        </motion.div>
      )}
    </div>
  );
}

interface Leader {
  label: string;
  name: string;
  value: string;
}

function computeLeaders(stats: SimPlayerStat[]): Leader[] {
  if (!stats || stats.length === 0) return [];
  const out: Leader[] = [];
  const top = (pred: (p: SimPlayerStat) => boolean, key: (p: SimPlayerStat) => number, dir: 1 | -1) => {
    const pool = stats.filter(pred);
    if (pool.length === 0) return null;
    return pool.reduce((best, p) => (key(p) * dir > key(best) * dir ? p : best));
  };
  const runs = top(() => true, (p) => p.runs, 1);
  if (runs) out.push({ label: "Most runs", name: runs.name, value: `${runs.runs}` });
  const sixes = top((p) => p.sixes > 0, (p) => p.sixes, 1);
  if (sixes) out.push({ label: "Most sixes", name: sixes.name, value: `${sixes.sixes}` });
  const sr = top((p) => p.ballsFaced >= 60, (p) => p.strikeRate, 1);
  if (sr) out.push({ label: "Best strike rate", name: sr.name, value: `${sr.strikeRate}` });
  const wkts = top((p) => p.wickets > 0, (p) => p.wickets, 1);
  if (wkts) out.push({ label: "Most wickets", name: wkts.name, value: `${wkts.wickets}` });
  const econ = top((p) => p.oversBowled >= 10, (p) => p.economy, -1);
  if (econ) out.push({ label: "Lowest economy", name: econ.name, value: `${econ.economy}` });
  const catches = top((p) => p.catches > 0, (p) => p.catches, 1);
  if (catches) out.push({ label: "Most catches", name: catches.name, value: `${catches.catches}` });
  return out;
}

function Tally({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="p-3 text-center" style={{ background: "var(--paper-2)" }}>
      <div className="font-display text-3xl leading-none" style={{ color: color ?? "var(--ink)" }}>{value}</div>
      <div className="eyebrow mt-1" style={{ letterSpacing: "0.1em" }}>{label}</div>
    </div>
  );
}

function MatchRow({ match }: { match: MatchResult }) {
  const outcome = match.tied ? "T" : match.won ? "W" : "L";
  const outColor = match.won ? "var(--pitch)" : match.tied ? "var(--ink-soft)" : "var(--spot-deep)";
  return (
    <div className="flex items-center gap-2 px-3 py-2" style={{ background: "var(--paper-2)" }}>
      <span className="font-display flex h-5 w-5 shrink-0 items-center justify-center text-xs" style={{ background: outColor, color: "var(--paper-2)" }}>
        {outcome}
      </span>
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm">{opponentLabel(match)}</span>
        <span className="ml-1 text-xs" style={{ color: "var(--ink-faint)" }}>{match.isHome ? "(H)" : "(A)"}</span>
      </div>
      <span className="font-mono shrink-0 text-xs" style={{ color: "var(--ink-soft)" }}>
        {match.yourScore.runs}/{match.yourScore.wickets} – {match.theirScore.runs}/{match.theirScore.wickets}
      </span>
    </div>
  );
}
