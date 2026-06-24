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
  const [showCelebration, setShowCelebration] = useState(false);
  const [shared, setShared] = useState(false);

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
  // Celebrate any title win — a championship counts even if the league wasn't unbeaten; a Perfect
  // Season gets the bigger shower.
  useEffect(() => {
    if (!done) return;
    const celebrate = result.wonTitle || verdict.easterEgg === "GOAT";
    if (!celebrate) return;
    const big = verdict.easterEgg === "GOAT";
    let frame = 0;
    const colors = [theme.accent, "var(--spot)", "var(--spot-2)"];
    const interval = setInterval(() => {
      confetti({ particleCount: big ? 70 : 45, spread: 100, startVelocity: 45, origin: { y: 0.3 }, colors });
      frame++;
      if (frame >= (big ? 4 : 2)) clearInterval(interval);
    }, 350);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, verdict.easterEgg, result.wonTitle]);

  // A Perfect Season is the rarest outcome — pop a full-screen celebration on a live run.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot trigger when the run resolves
    if (done && !instant && verdict.tier === "PERFECT_SEASON") setShowCelebration(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

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

  async function handleShare() {
    const rec = `${wins}–${losses}${draws > 0 ? `–${draws}` : ""}`;
    const titleBit = result.wonTitle ? ", and won the title" : "";
    const text = `IPL Perfect Season — ${theme.label}! I went ${rec} and finished #${result.finalRank}${titleBit}.`;
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const topScorer = leaders.find((l) => l.label === "Most runs");
    try {
      const blob = await buildResultImage({
        tier: theme.label,
        accent: theme.accent,
        record: rec,
        points: result.points,
        finishRank: result.finalRank,
        wonTitle: result.wonTitle,
        verdictLine: verdict.verdictLine,
        topScorer: topScorer ? `${topScorer.name} — ${topScorer.value} runs` : null,
      });
      const file = new File([blob], "ipl-perfect-season.png", { type: "image/png" });
      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      if (nav?.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: "IPL Perfect Season", text });
        return;
      }
      // No file-share support (most desktops) — download the image so it can be shared anywhere.
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "ipl-perfect-season.png";
      a.click();
      URL.revokeObjectURL(objectUrl);
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    } catch {
      // Image generation/share failed or was dismissed — fall back to copying a text summary.
      try {
        await navigator.clipboard.writeText(`${text} ${url}`.trim());
        setShared(true);
        setTimeout(() => setShared(false), 2500);
      } catch {
        /* nothing more to do */
      }
    }
  }

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
          // League's done and you've made the top four — announce it BEFORE the gauntlet is played.
          // (This branch only renders when you qualified; missing out jumps straight to the verdict.)
          <div>
            <span
              className="eyebrow inline-block px-2 py-1"
              style={{ background: TIER_THEME.PLAYOFF_BOUND.badgeBg, color: TIER_THEME.PLAYOFF_BOUND.accent, letterSpacing: "0.16em" }}
            >
              Playoff bound
            </span>
            <h2 className="font-display mt-3 text-3xl leading-none sm:text-4xl">
              {wins}–{losses}
              {draws > 0 ? `–${draws}` : ""} · into the playoffs
            </h2>
            <p className="mt-3 max-w-lg leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              Top four — you&rsquo;re through. Now win three knockouts against the all-time XIs to be champions.
            </p>
          </div>
        )}

        <div className="rule-double my-5" />

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
            <span className="eyebrow">Playoffs · three knockouts against all-time XIs</span>
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

        {/* ── League game feed (newest first) — kept below the playoff controls so the buttons sit
             near the top without scrolling ── */}
        <div className="mb-1 flex flex-col gap-px" style={{ background: "var(--rule)" }}>
          <AnimatePresence initial={false}>
            {Array.from({ length: leagueRevealed }, (_, i) => leagueRevealed - 1 - i).map((idx) => (
              <motion.div key={idx} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <MatchRow match={league[idx]} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

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

            {!user && onSave && (
              <div
                className="mt-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ border: "1.5px solid var(--spot)", background: "var(--paper-3)" }}
              >
                <div>
                  <div className="font-display text-lg leading-none" style={{ color: "var(--spot)" }}>
                    Don&rsquo;t lose this run
                  </div>
                  <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
                    Sign in to save your results, track your history, and rank on the leaderboard.
                  </p>
                </div>
                <button
                  onClick={() => setShowSignIn(true)}
                  className="font-display print-shadow shrink-0 px-6 py-2.5 text-lg"
                  style={{ background: "var(--spot)", color: "var(--spot-ink)" }}
                >
                  Sign in
                </button>
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
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleShare}
                className="font-display px-6 py-3 text-lg"
                style={{ background: "var(--spot-2)", color: "var(--spot-2-ink)" }}
              >
                {shared ? "Copied ✓" : "Share result"}
              </motion.button>
              {saveState === "saving" && <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>Saving run…</span>}
              {saveState === "saved" && <span className="font-mono text-xs" style={{ color: "var(--pitch)" }}>✓ Saved to your runs</span>}
              {saveState === "error" && <span className="font-mono text-xs" style={{ color: "var(--spot-deep)" }}>Couldn&rsquo;t save this run.</span>}
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>{showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}</AnimatePresence>
      <AnimatePresence>
        {showCelebration && <PerfectSeasonCelebration onClose={() => setShowCelebration(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}

const PER_BATTER_MS = 750; // pace of the final's batter-by-batter reveal (slow enough to follow)
const BOSS_COUNTUP_MS = 3400; // the All-Time XI's final innings ticks up over this long, for suspense

/** A number that animates up from 0 to `to` with an ease-out — used for the final chase. */
function CountUp({ to, duration = BOSS_COUNTUP_MS }: { to: number; duration?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setN(Math.round(to * (1 - Math.pow(1 - t, 2))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{n}</>;
}

/** Full-screen pay-off for the game's rarest result — a Perfect Season. */
function PerfectSeasonCelebration({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const colors = ["#ffd700", "#ff4d3d", "var(--spot)", "var(--spot-2)", "var(--pitch)"];
    let frame = 0;
    const iv = setInterval(() => {
      confetti({ particleCount: 120, spread: 160, startVelocity: 55, origin: { y: 0.4 }, colors });
      confetti({ particleCount: 50, angle: 60, spread: 80, origin: { x: 0, y: 0.6 }, colors });
      confetti({ particleCount: 50, angle: 120, spread: 80, origin: { x: 1, y: 0.6 }, colors });
      frame++;
      if (frame >= 6) clearInterval(iv);
    }, 500);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      clearInterval(iv);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(8, 10, 14, 0.82)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Perfect Season"
    >
      <motion.div
        className="sheet print-shadow relative w-full max-w-lg overflow-hidden p-8 text-center"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute left-0 top-0 h-2 w-full" style={{ background: "var(--spot-2)" }} />
        <span className="eyebrow" style={{ color: "var(--spot-2-deep)" }}>
          The rarest result
        </span>
        <motion.h2
          className="font-display mt-3 text-5xl leading-[0.95] sm:text-7xl"
          style={{ color: "var(--spot)" }}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 160 }}
        >
          Perfect
          <br />
          Season
        </motion.h2>
        <p className="mt-4 text-lg" style={{ color: "var(--ink)" }}>
          Played 14 · Won 14 · Champions
        </p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          Unbeaten through the league and the all-time gauntlet — something no real IPL side has ever
          done. You built the perfect team.
        </p>
        <button onClick={onClose} className="btn-primary font-display mt-6 px-8 py-3 text-xl">
          See the scorecard →
        </button>
      </motion.div>
    </motion.div>
  );
}

/** A playoff game revealed innings by innings, in the order the teams actually batted. The final
 *  reveals your innings batter by batter. If `revealed`, it shows fully at once (history view). */
function PlayoffGameCard({ match, onDone, revealed }: { match: PlayoffMatchResult; onDone?: () => void; revealed?: boolean }) {
  const card = match.battingCard;
  // The two innings in the real order they were played.
  const innings: ("you" | "them")[] = match.youBattedFirst ? ["you", "them"] : ["them", "you"];
  const userStep = (match.youBattedFirst ? 0 : 1) + 1; // 1-indexed step at which your innings shows
  const isFinalReveal = !!card && !revealed;
  // In the final, once you've posted a total, hold the All-Time XI's chase behind a button for
  // suspense (only when you batted first — otherwise your own chase is the suspense).
  const bossGate = isFinalReveal && match.youBattedFirst;
  // The step at which the All-Time XI bats in the final — their innings ticks up slowly for drama.
  const bossStep = match.youBattedFirst ? 2 : 1;

  const [step, setStep] = useState(revealed ? 3 : 0);
  const [bossReady, setBossReady] = useState(false);

  useEffect(() => {
    if (revealed) return;
    if (step >= 3) return;
    // After your innings in the final, surface the "bowl to them" button instead of auto-advancing.
    if (bossGate && step === 1) {
      const t = setTimeout(() => setBossReady(true), card!.length * PER_BATTER_MS + 600);
      return () => clearTimeout(t);
    }
    let dwell = INNINGS_MS;
    if (step === 0) dwell = 350;
    else if (isFinalReveal && step === userStep) dwell = card!.length * PER_BATTER_MS + 800;
    else if (isFinalReveal && step === bossStep) dwell = BOSS_COUNTUP_MS + 700; // let the chase tick out
    const t = setTimeout(() => setStep((s) => s + 1), dwell);
    return () => clearTimeout(t);
  }, [step, revealed, bossGate, isFinalReveal, userStep, bossStep, card]);

  useEffect(() => {
    if (!revealed && step >= 3) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const outcome = match.won ? "WON" : match.tied ? "TIED" : "LOST";
  const outColor = match.won ? "var(--pitch)" : match.tied ? "var(--ink-soft)" : "var(--spot-deep)";

  function renderInnings(who: "you" | "them", position: number) {
    if (step < position) return null;
    const ordinal = position === 1 ? "1st" : "2nd";
    if (who === "them") {
      // In the final, the All-Time XI's innings ticks up slowly (suspenseful chase / total).
      const tickUp = !!card && !revealed;
      return (
        <motion.div
          key={`them-${position}`}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex justify-between font-mono text-sm"
          style={{ color: tickUp ? "var(--ink)" : "var(--ink-soft)" }}
        >
          <span>{ordinal} innings · {match.opponentName}</span>
          <span className={tickUp ? "font-bold" : undefined}>
            {tickUp ? <CountUp to={match.theirScore.runs} /> : match.theirScore.runs}/{match.theirScore.wickets}
          </span>
        </motion.div>
      );
    }
    // Your innings — full batter-by-batter card on the final, a single line otherwise.
    if (card) {
      return (
        <div key={`you-${position}`} className="mt-1">
          <div className="eyebrow mb-1" style={{ letterSpacing: "0.14em" }}>
            {ordinal} innings · your XI
          </div>
          <div className="flex flex-col gap-0.5">
            {card.map((b, i) => (
              <motion.div
                key={b.name + i}
                initial={revealed ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: revealed ? 0 : i * (PER_BATTER_MS / 1000), duration: 0.22 }}
                className="flex items-baseline justify-between font-mono text-xs"
              >
                <span className="truncate" style={{ color: "var(--ink)" }}>
                  {b.name}
                  {!b.out && <span style={{ color: "var(--pitch)" }}> *</span>}
                </span>
                <span className="shrink-0 pl-2" style={{ color: "var(--ink-soft)" }}>
                  <span className="font-bold" style={{ color: "var(--ink)" }}>{b.runs}</span>
                  <span style={{ color: "var(--ink-faint)" }}> ({b.balls})</span>
                </span>
              </motion.div>
            ))}
          </div>
          <motion.div
            initial={revealed ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: revealed ? 0 : card.length * (PER_BATTER_MS / 1000) }}
            className="mt-1.5 flex justify-between border-t pt-1 font-mono text-sm"
            style={{ borderColor: "var(--rule)" }}
          >
            <span className="font-semibold">Total</span>
            <span className="font-bold">{match.yourScore.runs}/{match.yourScore.wickets} ({match.yourScore.overs} ov)</span>
          </motion.div>
        </div>
      );
    }
    return (
      <motion.div
        key={`you-${position}`}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex justify-between font-mono text-sm"
      >
        <span>{ordinal} innings · You</span>
        <span>{match.yourScore.runs}/{match.yourScore.wickets}</span>
      </motion.div>
    );
  }

  return (
    <div className="p-3" style={{ background: "var(--paper-2)", border: "1.5px solid var(--ink)" }}>
      <div className="flex items-center justify-between">
        <span className="font-display text-lg leading-none" style={{ color: "var(--spot)" }}>
          {PLAYOFF_STAGE_LABEL[match.stage]}
        </span>
        <span className="text-sm font-semibold">{opponentLabel(match)}</span>
      </div>
      <div className="mt-2 space-y-1">
        {renderInnings(innings[0], 1)}
        {bossGate && bossReady && step === 1 && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setBossReady(false);
              setStep(2);
            }}
            className="font-display mt-2 w-full py-2.5 text-base"
            style={{ border: "1.5px solid var(--ink)", color: "var(--spot)" }}
          >
            Bowl to the All-Time XI →
          </motion.button>
        )}
        {renderInnings(innings[1], 2)}
      </div>
      {step >= 3 && match.superOver && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 border-t pt-1.5 font-mono text-xs"
          style={{ borderColor: "var(--rule)" }}
        >
          <span className="eyebrow" style={{ letterSpacing: "0.14em", color: "var(--spot)" }}>
            Tied — Super Over
          </span>
          <div className="mt-1 flex justify-between">
            <span>You</span>
            <span className="font-bold">{match.superOver.yourRuns}/{match.superOver.yourWickets}</span>
          </div>
          <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
            <span>{match.opponentName}</span>
            <span>{match.superOver.theirRuns}/{match.superOver.theirWickets}</span>
          </div>
        </motion.div>
      )}
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

interface ShareCard {
  tier: string;
  accent: string;
  record: string;
  points: number;
  finishRank: number;
  wonTitle: boolean;
  verdictLine: string;
  topScorer: string | null;
}

/** Draw a self-contained result card (PNG) the player can share — shows exactly what they got. */
async function buildResultImage(c: ShareCard): Promise<Blob> {
  const S = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  // Fixed stone palette so the shared image looks the same regardless of the user's theme.
  const paper = "#e9ebe3", ink = "#15181a", inkSoft = "#555a55", spot = "#182e86";
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, S, S);
  ctx.lineWidth = 14;
  ctx.strokeStyle = ink;
  ctx.strokeRect(7, 7, S - 14, S - 14);
  ctx.fillStyle = c.accent;
  ctx.fillRect(48, 48, S - 96, 12);

  ctx.textAlign = "center";
  const cx = S / 2;
  const maxW = S - 150;

  ctx.fillStyle = inkSoft;
  ctx.font = "bold 30px ui-monospace, monospace";
  ctx.fillText("IPL  PERFECT  SEASON", cx, 135);

  // Tier label — large, greedily wrapped, shrunk until the longest word fits.
  ctx.fillStyle = c.accent;
  const words = c.tier.toUpperCase().split(" ");
  let fs = 132;
  ctx.font = `800 ${fs}px sans-serif`;
  while (fs > 64 && Math.max(...words.map((w) => ctx.measureText(w).width)) > maxW) {
    fs -= 6;
    ctx.font = `800 ${fs}px sans-serif`;
  }
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  let y = 300;
  for (const ln of lines) {
    ctx.fillText(ln, cx, y);
    y += fs * 1.02;
  }

  // Record + meta
  y += 50;
  ctx.fillStyle = ink;
  ctx.font = "800 160px sans-serif";
  ctx.fillText(c.record, cx, y);
  y += 70;
  ctx.fillStyle = inkSoft;
  ctx.font = "bold 38px ui-monospace, monospace";
  ctx.fillText(`${c.points} PTS  ·  FINISHED #${c.finishRank}${c.wonTitle ? "  ·  CHAMPIONS" : ""}`, cx, y);

  // Verdict line (wrapped)
  y += 95;
  ctx.fillStyle = ink;
  ctx.font = "38px sans-serif";
  let vcur = "";
  for (const w of c.verdictLine.split(" ")) {
    const test = vcur ? `${vcur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && vcur) {
      ctx.fillText(vcur, cx, y);
      y += 50;
      vcur = w;
    } else vcur = test;
  }
  if (vcur) ctx.fillText(vcur, cx, y);

  if (c.topScorer) {
    ctx.fillStyle = inkSoft;
    ctx.font = "bold 30px ui-monospace, monospace";
    ctx.fillText(`TOP SCORER · ${c.topScorer.toUpperCase()}`, cx, S - 150);
  }
  ctx.fillStyle = spot;
  ctx.font = "bold 32px ui-monospace, monospace";
  ctx.fillText("CAN YOU BUILD A PERFECT SEASON?", cx, S - 90);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
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
