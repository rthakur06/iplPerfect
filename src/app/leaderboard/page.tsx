"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import type { ResultTier } from "@/engine/types";
import { TIER_THEME } from "../tierTheme";
import { ThemeToggle } from "../components/ThemeToggle";
import { AccountNav } from "../components/AccountNav";

interface Entry {
  username: string;
  overall: number;
  tier: ResultTier;
  points: number;
  wins: number;
  finalRank: number;
  wonTitle: boolean;
}

export default function LeaderboardPage() {
  const [boards, setBoards] = useState<{ easy: Entry[]; hard: Entry[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/leaderboard", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setBoards(d ?? { easy: [], hard: [] });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="relative min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <nav className="mb-5 flex items-center justify-between">
          <Link href="/" className="font-display text-2xl leading-none">
            IPL Perfect Season
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/" className="font-mono px-2.5 py-1 text-xs" style={{ border: "1.5px solid var(--ink)" }}>
              Play
            </Link>
            <AccountNav />
            <ThemeToggle />
          </div>
        </nav>
        <div className="rule-double mb-6" />

        <header className="mb-7">
          <span className="eyebrow" style={{ color: "var(--spot-2-deep)" }}>
            Hall of fame
          </span>
          <h1 className="font-display mt-1 text-4xl leading-none sm:text-6xl">Leaderboard</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Every player&rsquo;s strongest XI, ranked by team overall. Draft a higher-rated side to
            climb — ties broken by your best season result.
          </p>
        </header>

        {loading ? (
          <p className="font-mono text-sm" style={{ color: "var(--ink-faint)" }}>
            Loading the table…
          </p>
        ) : (
          <div className="space-y-10">
            <Board title="Easy" accent="var(--spot)" entries={boards?.easy ?? []} />
            <Board title="Hard" accent="var(--spot-2)" entries={boards?.hard ?? []} />
          </div>
        )}
      </div>
    </div>
  );
}

function Board({ title, accent, entries }: { title: string; accent: string; entries: Entry[] }) {
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <section className="sheet print-shadow overflow-hidden">
      <div className="p-5 sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="font-display px-3 py-1 text-lg leading-none" style={{ background: accent, color: "var(--spot-ink)" }}>
            {title}
          </span>
          <span className="eyebrow">mode · best XI per player</span>
        </div>

        {entries.length === 0 ? (
          <div className="px-2 py-10 text-center">
            <p className="mb-4" style={{ color: "var(--ink-soft)" }}>
              No {title.toLowerCase()}-mode runs on the board yet. Be the first.
            </p>
            <Link
              href="/"
              className="font-display print-shadow inline-block px-8 py-3 text-lg"
              style={{ background: accent, color: "var(--spot-ink)" }}
            >
              Play a season →
            </Link>
          </div>
        ) : (
          <>
            <Podium podium={podium} />
            {rest.length > 0 && (
              <ol className="mt-6 flex flex-col gap-px" style={{ background: "var(--rule)" }}>
                {rest.map((e, i) => (
                  <RankRow key={e.username} rank={i + 4} entry={e} />
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </section>
  );
}

const MEDALS = ["var(--gold)", "var(--silver)", "var(--bronze)"];
// Left-to-right by rank: 1st (tallest), 2nd, 3rd (shortest).
const PODIUM_ORDER = [0, 1, 2];
const PODIUM_HEIGHT = [196, 148, 120];

function Podium({ podium }: { podium: Entry[] }) {
  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
      {PODIUM_ORDER.map((idx) => {
        const e = podium[idx];
        if (!e) return <div key={idx} />;
        const theme = TIER_THEME[e.tier];
        const medal = MEDALS[idx];
        return (
          <motion.div
            key={e.username}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * idx, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center"
          >
            <span className="font-display text-2xl leading-none" style={{ color: medal }}>
              {idx + 1}
              <span className="text-sm">{ordinal(idx + 1)}</span>
            </span>
            <span className="mt-1 max-w-full truncate px-1 text-center text-sm font-semibold" title={e.username}>
              {e.username}
            </span>
            <div
              className="mt-2 flex w-full flex-col items-center justify-start gap-1 p-2 text-center"
              style={{ minHeight: PODIUM_HEIGHT[idx], background: "var(--paper-3)", borderTop: `4px solid ${medal}` }}
            >
              <span
                className="font-display mt-1 px-1.5 py-0.5 text-[11px] leading-tight sm:text-xs"
                style={{ background: theme.badgeBg, color: theme.accent }}
              >
                {theme.label}
              </span>
              <span className="font-display mt-auto text-4xl leading-none" style={{ color: medal }}>
                {e.overall}
              </span>
              <span className="eyebrow" style={{ letterSpacing: "0.14em", color: "var(--ink-faint)" }}>
                Overall
              </span>
              <span className="font-mono text-[10px]" style={{ color: "var(--ink-soft)" }}>
                {e.wins}/14 · {e.points} pts{e.wonTitle ? " · ★" : ""}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function RankRow({ rank, entry }: { rank: number; entry: Entry }) {
  const theme = TIER_THEME[entry.tier];
  return (
    <li className="flex items-center gap-3 px-3 py-2.5" style={{ background: "var(--paper-2)" }}>
      <span className="font-mono w-6 shrink-0 text-sm" style={{ color: "var(--ink-faint)" }}>
        {String(rank).padStart(2, "0")}
      </span>
      <span className="h-3 w-3 shrink-0" style={{ background: theme.accent }} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.username}</span>
      <span className="font-mono hidden text-xs sm:inline" style={{ color: "var(--ink-soft)" }}>
        {entry.wins}/14 · {entry.points} pts
      </span>
      <span className="font-display w-12 shrink-0 text-right text-xl leading-none" style={{ color: "var(--spot)" }}>
        {entry.overall}
      </span>
    </li>
  );
}

function ordinal(n: number): string {
  return n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
}
