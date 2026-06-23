"use client";

import { FRANCHISES } from "@/engine/data/franchises";
import { FranchiseCrest } from "./Crest";
import { franchiseColor } from "../franchiseTheme";

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
