"use client";

import { FRANCHISES } from "@/engine/data/franchises";
import { FranchiseCrest } from "./Crest";
import { franchiseColor } from "../franchiseTheme";

/** A solid band of every franchise's colour — the signature splash of colour on the cover, and a
 *  literal read of "every team, every season is in the pool." */
export function ColorSpectrum({ className = "", height = 8 }: { className?: string; height?: number }) {
  return (
    <div className={`flex w-full overflow-hidden ${className}`} style={{ height }} aria-hidden>
      {FRANCHISES.map((f) => (
        <span key={f.id} className="flex-1" style={{ background: franchiseColor(f.id) }} />
      ))}
    </div>
  );
}

/** A colour-segmented draft wheel — one wedge per franchise — slowly spinning, with a pointer.
 *  Purely decorative flourish for the spin screen. Set `fast` while a spin is in flight. */
export function SpinWheel({ size = 132, fast = false }: { size?: number; fast?: boolean }) {
  const colors = FRANCHISES.map((f) => franchiseColor(f.id));
  const step = 360 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(", ");
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden>
      {/* pointer */}
      <div
        className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderTop: "14px solid var(--ink)",
        }}
      />
      <div
        className={fast ? "spin-disc-fast absolute inset-0 rounded-full" : "spin-disc absolute inset-0 rounded-full"}
        style={{ background: `conic-gradient(${stops})`, border: "3px solid var(--ink)", boxShadow: "3px 3px 0 var(--shadow-color)" }}
      />
      <div
        className="absolute flex items-center justify-center rounded-full"
        style={{ inset: size * 0.28, background: "var(--paper-2)", border: "2px solid var(--ink)" }}
      >
        <span className="font-display text-xl leading-none" style={{ color: "var(--spot)" }}>
          IPL
        </span>
      </div>
    </div>
  );
}

/** Continuous scrolling strip of franchise crest badges, tinted in each franchise's colour. */
export function CrestTicker() {
  const row = [...FRANCHISES, ...FRANCHISES];
  return (
    <div className="overflow-hidden py-3" aria-hidden>
      <div className="animate-marquee flex w-max gap-3">
        {row.map((f, i) => (
          <span key={i} className="flex shrink-0 items-center gap-1.5">
            <FranchiseCrest franchiseId={f.id} size={18} />
            <span className="font-mono text-xs" style={{ color: franchiseColor(f.id) }}>
              {f.name}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
