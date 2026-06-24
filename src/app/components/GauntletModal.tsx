"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { GAUNTLET, type BossPlayer } from "@/engine/teamStrength";
import { roleLabel } from "@/engine/rules";
import { toDisplayRating, toDisplayTeamRating } from "../displayRating";

const STAGE_LABEL: Record<string, string> = {
  QUALIFIER: "Qualifier",
  SEMI_FINAL: "Semi-final",
  FINAL: "Final",
};

/** Preview the three all-time XIs the player has to beat in the playoffs, with their own XI's
 *  overall alongside for comparison. */
export function GauntletModal({ yourOverall, onClose }: { yourOverall: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: "rgba(12, 14, 16, 0.6)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="The playoff gauntlet"
    >
      <motion.div
        className="sheet print-shadow my-auto w-full max-w-2xl"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-[1.5px] border-[var(--ink)] px-6 py-4">
          <div>
            <span className="eyebrow">Who you&rsquo;re up against</span>
            <h2 className="font-display text-2xl leading-none">The playoff gauntlet</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="font-mono flex h-8 w-8 items-center justify-center text-lg"
            style={{ border: "1.5px solid var(--ink)" }}
          >
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between px-6 py-3" style={{ background: "var(--paper-3)" }}>
          <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Three knockouts. Win all three to be champions.
          </span>
          <span className="font-mono text-sm">
            Your XI <span className="font-bold" style={{ color: "var(--spot)" }}>{yourOverall}</span>
          </span>
        </div>

        <div className="max-h-[64vh] space-y-5 overflow-y-auto p-6">
          {GAUNTLET.map(({ stage, boss }) => {
            const overall = toDisplayTeamRating(boss.overall);
            const tougher = overall >= yourOverall;
            return (
              <section key={stage}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <span className="eyebrow" style={{ color: "var(--spot)" }}>{STAGE_LABEL[stage]}</span>
                    <h3 className="font-display text-xl leading-none">{boss.name}</h3>
                    <p className="font-mono mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
                      Batting {toDisplayTeamRating(boss.batting)} · Bowling {toDisplayTeamRating(boss.bowling)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="eyebrow" style={{ letterSpacing: "0.12em" }}>Overall</div>
                    <div className="font-display text-3xl leading-none" style={{ color: tougher ? "var(--spot-deep)" : "var(--pitch)" }}>
                      {overall}
                    </div>
                  </div>
                </div>
                <ol className="mt-3 grid grid-cols-1 gap-px sm:grid-cols-2" style={{ background: "var(--rule)" }}>
                  {boss.players.map((p, i) => (
                    <BossRow key={p.name + i} index={i} player={p} />
                  ))}
                </ol>
              </section>
            );
          })}
        </div>

        <div className="border-t-[1.5px] border-[var(--ink)] px-6 py-4">
          <button onClick={onClose} className="btn-primary font-display w-full py-3 text-lg">
            Back to my XI
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function BossRow({ index, player }: { index: number; player: BossPlayer }) {
  const bowl = player.bowlingRole === "SPIN" ? "Spin" : player.bowlingRole === "PACE" ? "Pace" : null;
  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: "var(--paper-2)" }}>
      <span className="font-mono w-5 shrink-0 text-xs" style={{ color: "var(--ink-faint)" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      {player.isWicketkeeper && <span className="text-xs">✦</span>}
      <span className="min-w-0 flex-1 truncate text-sm">
        {player.name} <span className="text-xs" style={{ color: "var(--ink-faint)" }}>&rsquo;{String(player.season).slice(2)}</span>
      </span>
      <span className="font-mono hidden text-[10px] uppercase tracking-wide sm:inline" style={{ color: "var(--ink-faint)" }}>
        {bowl ? bowl : roleLabel(player.roles[0])}
      </span>
      <span className="font-mono text-sm font-bold" style={{ color: "var(--spot)" }}>
        {toDisplayRating(player.ovr)}
      </span>
    </li>
  );
}
