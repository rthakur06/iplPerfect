"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import type { ResultTier, SeasonResult, Verdict } from "@/engine/types";
import { TIER_THEME } from "../tierTheme";
import { useAuth } from "../components/AuthProvider";
import { ThemeToggle } from "../components/ThemeToggle";
import { SignInModal } from "../components/SignInModal";
import { SeasonResultView } from "../components/SeasonResultView";

const TIER_ORDER: ResultTier[] = [
  "WOODEN_SPOON",
  "MID_TABLE",
  "PLAYOFF_BOUND",
  "FINALIST",
  "CHAMPIONS",
  "UNBEATEN_LEAGUE_STAGE",
  "PERFECT_SEASON",
];

interface Run {
  id: number;
  createdAt: string;
  difficulty: string;
  tier: ResultTier;
  finalRank: number;
  points: number;
  wins: number;
  wonTitle: boolean;
  xi: { name: string; ovr?: number }[];
  hasDetail: boolean;
}

type Filter = "all" | "easy" | "hard";

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<{ result: SeasonResult; verdict: Verdict } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch runs when auth resolves
    setFetching(true);
    fetch("/api/runs", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (active) setRuns(d?.runs ?? []);
      })
      .finally(() => {
        if (active) setFetching(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const filtered = useMemo(() => (runs ?? []).filter((r) => filter === "all" || r.difficulty === filter), [runs, filter]);
  const stats = useMemo(() => computeStats(filtered), [filtered]);

  async function openRun(run: Run) {
    if (!run.hasDetail) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });
      const d = await res.json();
      if (d.detail) setDetail(d.detail);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <nav className="mb-5 flex items-center justify-between">
          <Link href="/" className="font-display text-2xl leading-none">
            IPL Perfect Season
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/play" className="font-mono px-2.5 py-1 text-xs" style={{ border: "1.5px solid var(--ink)" }}>
              Play
            </Link>
            <ThemeToggle />
          </div>
        </nav>
        <div className="rule-double mb-6" />

        <h1 className="font-display mb-5 text-4xl sm:text-5xl">
          {user?.name ? `${user.name}'s runs` : "My runs"}
        </h1>

        {loading ? (
          <p className="font-mono text-sm" style={{ color: "var(--ink-faint)" }}>
            Loading…
          </p>
        ) : !user ? (
          <div className="sheet p-7 text-center">
            <p className="mb-4" style={{ color: "var(--ink-soft)" }}>
              Sign in to keep a history of every season — your best run, your record, and the player
              you draft the most, split by difficulty.
            </p>
            <button
              onClick={() => setShowSignIn(true)}
              className="font-display print-shadow px-8 py-3 text-lg"
              style={{ background: "var(--spot)", color: "var(--spot-ink)" }}
            >
              Sign in
            </button>
          </div>
        ) : (
          <>
            {/* Difficulty filter */}
            <div className="mb-5 flex gap-2">
              {(["all", "easy", "hard"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="font-mono px-3 py-1.5 text-xs uppercase tracking-wide transition-colors"
                  style={{
                    border: "1.5px solid var(--ink)",
                    background: filter === f ? "var(--ink)" : "transparent",
                    color: filter === f ? "var(--paper-2)" : "var(--ink)",
                  }}
                >
                  {f === "all" ? "All runs" : f}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="sheet p-7 text-center">
                <p className="mb-4" style={{ color: "var(--ink-soft)" }}>
                  {fetching ? "Loading your runs…" : `No ${filter === "all" ? "" : filter + " "}runs yet.`}
                </p>
                <Link
                  href="/play"
                  className="font-display print-shadow inline-block px-8 py-3 text-lg"
                  style={{ background: "var(--spot)", color: "var(--spot-ink)" }}
                >
                  Play a season →
                </Link>
              </div>
            ) : (
              <>
                <Highlights stats={stats} />
                <h2 className="eyebrow mb-2 mt-8">
                  {filter === "all" ? "All runs" : `${filter} runs`} · {filtered.length}
                </h2>
                <div className="flex flex-col gap-px" style={{ background: "var(--rule)" }}>
                  {filtered.map((run) => (
                    <RunRow key={run.id} run={run} onClick={() => openRun(run)} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <AnimatePresence>{showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}</AnimatePresence>

      {/* Past-run detail = the exact end-of-run screen */}
      <AnimatePresence>
        {(detail || detailLoading) && (
          <motion.div
            className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-8"
            style={{ background: "rgba(12, 14, 16, 0.6)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDetail(null)}
          >
            <div className="mx-auto max-w-2xl" onClick={(e) => e.stopPropagation()}>
              {detailLoading && !detail ? (
                <p className="font-mono py-10 text-center text-sm" style={{ color: "var(--paper-2)" }}>
                  Loading run…
                </p>
              ) : detail ? (
                <SeasonResultView result={detail.result} verdict={detail.verdict} instant onClose={() => setDetail(null)} />
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface Stats {
  totalRuns: number;
  avgWins: number;
  avgRank: number;
  titles: number;
  bestRun: Run | null;
  favoritePlayer: { name: string; count: number } | null;
}

function computeStats(runs: Run[]): Stats {
  let best: Run | null = null;
  for (const run of runs) {
    if (!best) {
      best = run;
      continue;
    }
    const a = TIER_ORDER.indexOf(run.tier);
    const b = TIER_ORDER.indexOf(best.tier);
    if (a > b || (a === b && run.points > best.points)) best = run;
  }
  const n = runs.length;
  const counts = new Map<string, number>();
  for (const run of runs) for (const p of run.xi) if (p.name) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  let favoritePlayer: { name: string; count: number } | null = null;
  for (const [name, count] of counts) if (!favoritePlayer || count > favoritePlayer.count) favoritePlayer = { name, count };
  return {
    totalRuns: n,
    avgWins: n ? Math.round((runs.reduce((s, r) => s + r.wins, 0) / n) * 10) / 10 : 0,
    avgRank: n ? Math.round((runs.reduce((s, r) => s + r.finalRank, 0) / n) * 10) / 10 : 0,
    titles: runs.filter((r) => r.wonTitle).length,
    bestRun: best,
    favoritePlayer,
  };
}

function Highlights({ stats }: { stats: Stats }) {
  const best = stats.bestRun;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card label="Best run">
        {best ? (
          <>
            <div className="font-display text-2xl leading-none" style={{ color: TIER_THEME[best.tier].accent }}>
              {TIER_THEME[best.tier].label}
            </div>
            <div className="font-mono mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
              #{best.finalRank} · {best.wins}/14 wins · {best.points} pts
            </div>
          </>
        ) : (
          <span style={{ color: "var(--ink-faint)" }}>—</span>
        )}
      </Card>

      <Card label="Average record">
        <div className="font-display text-3xl leading-none">
          {stats.avgWins}
          <span className="text-lg" style={{ color: "var(--ink-soft)" }}>
            {" "}/14
          </span>
        </div>
        <div className="font-mono mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
          avg finish #{stats.avgRank} · {stats.titles} {stats.titles === 1 ? "title" : "titles"}
        </div>
      </Card>

      <Card label="Favorite player">
        {stats.favoritePlayer ? (
          <>
            <div className="font-display text-2xl leading-none">{stats.favoritePlayer.name}</div>
            <div className="font-mono mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
              drafted {stats.favoritePlayer.count}×
            </div>
          </>
        ) : (
          <span style={{ color: "var(--ink-faint)" }}>—</span>
        )}
      </Card>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sheet p-4">
      <div className="eyebrow mb-2">{label}</div>
      {children}
    </div>
  );
}

function RunRow({ run, onClick }: { run: Run; onClick: () => void }) {
  const theme = TIER_THEME[run.tier];
  const date = new Date(run.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return (
    <button
      onClick={onClick}
      disabled={!run.hasDetail}
      className="p-3 text-left transition-colors disabled:cursor-default"
      style={{ background: "var(--paper-2)" }}
    >
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0" style={{ background: theme.accent }} />
        <span className="font-display text-lg leading-none" style={{ color: theme.accent }}>
          {theme.label}
        </span>
        {run.hasDetail && (
          <span className="eyebrow" style={{ color: "var(--spot)", letterSpacing: "0.1em" }}>
            view →
          </span>
        )}
        <span className="font-mono ml-auto text-xs" style={{ color: "var(--ink-faint)" }}>
          {date}
        </span>
      </div>
      <div className="font-mono mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--ink-soft)" }}>
        <span>#{run.finalRank}</span>
        <span>{run.wins}/14 wins</span>
        <span>{run.points} pts</span>
        <span>{run.wonTitle ? "champions" : "no title"}</span>
        <span>{run.difficulty}</span>
      </div>
      {run.xi.length > 0 && (
        <div className="mt-1.5 truncate text-xs" style={{ color: "var(--ink-faint)" }}>
          {run.xi.map((p) => p.name).join(" · ")}
        </div>
      )}
    </button>
  );
}
