"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FRANCHISES } from "@/engine/data/franchises";
import { FranchiseCrest } from "./Crest";

/** A live "now spinning" teaser: cycles a random franchise + season every couple of seconds, the
 *  way the wheel would land — a moving hint of the core mechanic right on the cover. */
export function SpinTeaser() {
  // Start with a deterministic pair so SSR and the first client render match (no hydration
  // mismatch); only switch to random pairs after mount.
  const [pair, setPair] = useState(() => {
    const f = FRANCHISES[0];
    return { id: "seed", franchiseId: f.id, name: f.name, season: f.activeSeasons[0] };
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- randomise only after hydration
    setPair(randomPair());
    const t = setInterval(() => setPair(randomPair()), 1900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-3 overflow-hidden p-3" style={{ background: "var(--paper-3)", border: "1.5px solid var(--ink)" }}>
      <span className="eyebrow shrink-0" style={{ letterSpacing: "0.18em" }}>
        Now
        <br />
        spinning
      </span>
      <span className="h-9 w-px shrink-0" style={{ background: "var(--rule)" }} />
      <AnimatePresence mode="wait">
        <motion.div
          key={pair.id}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={{ duration: 0.28 }}
          className="flex min-w-0 items-center gap-2.5"
        >
          <FranchiseCrest franchiseId={pair.franchiseId} size={26} />
          <span className="font-display truncate text-lg leading-none">{pair.name}</span>
          <span className="font-mono text-lg font-bold" style={{ color: "var(--spot)" }}>
            {pair.season}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Continuous scrolling strip of franchise crest badges. */
export function CrestTicker() {
  const row = [...FRANCHISES, ...FRANCHISES];
  return (
    <div className="overflow-hidden py-3" aria-hidden>
      <div className="animate-marquee flex w-max gap-3">
        {row.map((f, i) => (
          <span key={i} className="flex shrink-0 items-center gap-1.5">
            <FranchiseCrest franchiseId={f.id} size={18} />
            <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
              {f.name}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function randomPair() {
  const f = FRANCHISES[Math.floor(Math.random() * FRANCHISES.length)];
  const season = f.activeSeasons[Math.floor(Math.random() * f.activeSeasons.length)];
  return { id: `${f.id}-${season}-${Math.random()}`, franchiseId: f.id, name: f.name, season };
}
