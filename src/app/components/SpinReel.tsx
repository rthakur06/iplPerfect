"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { TeamSeason } from "@/engine/types";
import { getFranchise } from "@/engine/data/franchises";
import { franchiseColor } from "../franchiseTheme";

const ITEM_HEIGHT = 76;
const VISIBLE_HEIGHT = ITEM_HEIGHT * 3;
const FILLER_COUNT = 26;

const TEAM_DURATION = 2.3;
const YEAR_DURATION = 2.7; // lands a beat after the team reel, for a two-stage reveal

export type SpinMode = "both" | "team" | "year";

interface SpinReelProps {
  candidates: TeamSeason[];
  result: TeamSeason; // chosen first, deterministically, before any animation — the reels just reveal it
  spinToken: number; // bump to trigger a new spin animation
  spinMode?: SpinMode; // which reel(s) actually spin (a team/year reroll only moves one)
  onSettled: () => void;
}

type Phase = "idle" | "spinning" | "settled";

function Reel({
  items,
  finalIndex,
  phase,
  duration,
  accent,
  reveal,
  onAnimationComplete,
  renderItem,
}: {
  items: unknown[];
  finalIndex: number;
  phase: Phase;
  duration: number;
  accent: string;
  reveal: boolean; // only colour the landed row once the whole spin has settled (no early spoiler)
  onAnimationComplete?: () => void;
  renderItem: (item: unknown, isFinal: boolean) => React.ReactNode;
}) {
  const restY = -(finalIndex * ITEM_HEIGHT) + (VISIBLE_HEIGHT - ITEM_HEIGHT) / 2;

  return (
    <div
      className="relative overflow-hidden flex-1"
      style={{ height: VISIBLE_HEIGHT, border: "1.5px solid var(--ink)", background: "var(--paper-2)" }}
    >
      <motion.div
        className="pointer-events-none absolute left-0 right-0 z-10 border-y-2"
        style={{ top: ITEM_HEIGHT, height: ITEM_HEIGHT, borderColor: "var(--ink)" }}
        animate={
          reveal
            ? { borderColor: ["var(--ink)", accent, "var(--ink)"], backgroundColor: [`${accent}00`, `${accent}22`, `${accent}00`] }
            : {}
        }
        transition={{ duration: 0.7, ease: "easeOut", repeat: 1 }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{ background: "linear-gradient(to bottom, var(--paper-2), transparent 30%, transparent 70%, var(--paper-2))" }}
      />

      <motion.div
        animate={
          phase === "spinning"
            ? { y: [0, restY * 0.55, restY], filter: ["blur(0px)", "blur(3px)", "blur(0px)"] }
            : { y: phase === "idle" ? 0 : restY, filter: "blur(0px)" }
        }
        transition={phase === "spinning" ? { duration, times: [0, 0.55, 1], ease: ["easeIn", [0.13, 0.78, 0.1, 1]] } : { duration: 0 }}
        onAnimationComplete={() => {
          if (phase === "spinning") onAnimationComplete?.();
        }}
      >
        {items.map((item, i) => (
          <div key={i} style={{ height: ITEM_HEIGHT }} className="flex items-center justify-center">
            {renderItem(item, i === finalIndex && reveal)}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export function SpinReel({ candidates, result, spinToken, spinMode = "both", onSettled }: SpinReelProps) {
  const [teamStrip, setTeamStrip] = useState<string[]>([result.franchiseId]);
  const [yearStrip, setYearStrip] = useState<number[]>([result.season]);
  const [teamPhase, setTeamPhase] = useState<Phase>("idle");
  const [yearPhase, setYearPhase] = useState<Phase>("idle");
  const [lastToken, setLastToken] = useState(0);
  const [pendingSettle, setPendingSettle] = useState(false);

  if (spinToken !== lastToken) {
    // Filler reel items are purely cosmetic (they blur past), picked deterministically so this
    // render-phase state sync stays pure.
    const pick = (i: number) => candidates[(i * 7 + spinToken * 13) % candidates.length];
    const spinTeam = spinMode === "both" || spinMode === "team";
    const spinYear = spinMode === "both" || spinMode === "year";

    if (spinTeam) {
      setTeamStrip([...Array.from({ length: FILLER_COUNT }, (_, i) => pick(i).franchiseId), result.franchiseId]);
      setTeamPhase("spinning");
    } else {
      // Unchanged reel — just hold the (same) value still, no animation.
      setTeamStrip([result.franchiseId]);
      setTeamPhase("settled");
    }
    if (spinYear) {
      setYearStrip([...Array.from({ length: FILLER_COUNT }, (_, i) => pick(i + 3).season), result.season]);
      setYearPhase("spinning");
    } else {
      setYearStrip([result.season]);
      setYearPhase("settled");
    }
    setPendingSettle(true);
    setLastToken(spinToken);
  }

  // Fire onSettled exactly once per spin, when both reels have come to rest.
  useEffect(() => {
    if (pendingSettle && teamPhase === "settled" && yearPhase === "settled") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot guard so onSettled fires once
      setPendingSettle(false);
      onSettled();
    }
  }, [pendingSettle, teamPhase, yearPhase, onSettled]);

  const bothSettled = teamPhase === "settled" && yearPhase === "settled";
  const accent = franchiseColor(result.franchiseId);

  return (
    <div className="flex gap-3">
      <Reel
        items={teamStrip}
        finalIndex={teamStrip.length - 1}
        phase={teamPhase}
        duration={TEAM_DURATION}
        accent={accent}
        reveal={bothSettled}
        onAnimationComplete={() => setTeamPhase("settled")}
        renderItem={(item, isFinal) => {
          const franchiseId = item as string;
          const franchise = getFranchise(franchiseId);
          const color = franchiseColor(franchiseId);
          return (
            <motion.div
              className="flex items-center gap-3 px-4"
              animate={isFinal ? { scale: [1, 1.12, 1], opacity: 1 } : { opacity: 0.5 }}
              transition={isFinal ? { duration: 0.45, ease: "easeOut" } : { duration: 0.2 }}
            >
              <span className="h-9 w-2 shrink-0" style={{ backgroundColor: color }} />
              <span className="font-display text-lg leading-none" style={isFinal ? { color } : undefined}>
                {franchise?.name ?? franchiseId}
              </span>
            </motion.div>
          );
        }}
      />
      <Reel
        items={yearStrip}
        finalIndex={yearStrip.length - 1}
        phase={yearPhase}
        duration={YEAR_DURATION}
        accent={accent}
        reveal={bothSettled}
        onAnimationComplete={() => setYearPhase("settled")}
        renderItem={(item, isFinal) => (
          <motion.span
            className="font-mono text-2xl font-bold"
            animate={isFinal ? { scale: [1, 1.18, 1], opacity: 1 } : { opacity: 0.4 }}
            transition={isFinal ? { duration: 0.45, ease: "easeOut" } : { duration: 0.2 }}
            style={{ color: isFinal ? accent : "var(--ink)" }}
          >
            {item as number}
          </motion.span>
        )}
      />
    </div>
  );
}
