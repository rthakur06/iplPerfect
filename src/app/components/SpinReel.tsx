"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { TeamSeason } from "@/engine/types";
import { getFranchise } from "@/engine/data/franchises";
import { franchiseColor } from "../franchiseTheme";

const ITEM_HEIGHT = 76;
const VISIBLE_HEIGHT = ITEM_HEIGHT * 3;
const FILLER_COUNT = 26;

const TEAM_DURATION = 2.3;
const YEAR_DURATION = 2.7; // lands a beat after the team reel, for a two-stage reveal

interface SpinReelProps {
  candidates: TeamSeason[];
  result: TeamSeason; // chosen first, deterministically, before any animation — the reels just reveal it
  spinToken: number; // bump to trigger a new spin animation
  onSettled: () => void;
}

type Phase = "idle" | "spinning" | "settled";

function Reel({
  items,
  finalIndex,
  phase,
  duration,
  onAnimationComplete,
  renderItem,
}: {
  items: unknown[];
  finalIndex: number;
  phase: Phase;
  duration: number;
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
        style={{
          top: ITEM_HEIGHT,
          height: ITEM_HEIGHT,
          borderColor: "var(--ink)",
        }}
        animate={phase === "settled" ? { borderColor: ["var(--ink)", "var(--spot)", "var(--ink)"] } : {}}
        transition={{ duration: 0.6, ease: "easeOut" }}
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
        transition={
          phase === "spinning"
            ? { duration, times: [0, 0.55, 1], ease: ["easeIn", [0.13, 0.78, 0.1, 1]] }
            : { duration: 0 }
        }
        onAnimationComplete={() => {
          if (phase === "spinning") onAnimationComplete?.();
        }}
      >
        {items.map((item, i) => (
          <div key={i} style={{ height: ITEM_HEIGHT }} className="flex items-center justify-center">
            {renderItem(item, i === finalIndex && phase === "settled")}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export function SpinReel({ candidates, result, spinToken, onSettled }: SpinReelProps) {
  const [teamStrip, setTeamStrip] = useState<string[]>([result.franchiseId]);
  const [yearStrip, setYearStrip] = useState<number[]>([result.season]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lastToken, setLastToken] = useState(0);
  const [teamDone, setTeamDone] = useState(false);

  if (spinToken !== lastToken) {
    // Filler reel items are purely cosmetic (they blur past), so pick them deterministically from
    // the candidate list — keeps this render-phase state sync pure (no Math.random) while still
    // varying per spin via spinToken.
    const pick = (i: number) => candidates[(i * 7 + spinToken * 13) % candidates.length];
    const teamFiller = Array.from({ length: FILLER_COUNT }, (_, i) => pick(i).franchiseId);
    const yearFiller = Array.from({ length: FILLER_COUNT }, (_, i) => pick(i + 3).season);
    setTeamStrip([...teamFiller, result.franchiseId]);
    setYearStrip([...yearFiller, result.season]);
    setPhase("spinning");
    setTeamDone(false);
    setLastToken(spinToken);
  }

  const teamFinalIndex = teamStrip.length - 1;
  const yearFinalIndex = yearStrip.length - 1;

  return (
    <div className="flex gap-3">
      <Reel
        items={teamStrip}
        finalIndex={teamFinalIndex}
        phase={phase}
        duration={TEAM_DURATION}
        onAnimationComplete={() => setTeamDone(true)}
        renderItem={(item, isFinal) => {
          const franchiseId = item as string;
          const franchise = getFranchise(franchiseId);
          const color = franchiseColor(franchiseId);
          return (
            <div className={`flex items-center gap-3 px-4 transition-opacity ${isFinal ? "opacity-100" : "opacity-25"}`}>
              <span className="w-2 h-9 shrink-0" style={{ backgroundColor: color }} />
              <span className="font-display text-lg leading-none">{franchise?.name ?? franchiseId}</span>
            </div>
          );
        }}
      />
      <Reel
        items={yearStrip}
        finalIndex={yearFinalIndex}
        phase={phase}
        duration={YEAR_DURATION}
        onAnimationComplete={() => {
          if (teamDone) {
            setPhase("settled");
            onSettled();
          } else {
            // Defensive: if the year reel somehow finishes first, still settle once both are in.
            setPhase("settled");
            onSettled();
          }
        }}
        renderItem={(item, isFinal) => (
          <span
            className="font-mono font-bold text-2xl transition-opacity"
            style={{ opacity: isFinal ? 1 : 0.25, color: isFinal ? "var(--spot)" : "var(--ink)" }}
          >
            {item as number}
          </span>
        )}
      />
    </div>
  );
}
