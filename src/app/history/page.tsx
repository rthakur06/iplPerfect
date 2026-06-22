"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import type { ResultTier } from "@/engine/types";
import { TIER_THEME } from "../tierTheme";
import { useAuth } from "../components/AuthProvider";
import { ThemeToggle } from "../components/ThemeToggle";
import { SignInModal } from "../components/SignInModal";

interface RunXiEntry {
  name: string;
  ovr?: number;
}
interface Run {
  id: number;
  createdAt: string;
  difficulty: string;
  tier: ResultTier;
  finalRank: number;
  points: number;
  wins: number;
  wonTitle: boolean;
  xi: RunXiEntry[];
}
interface Stats {
  totalRuns: number;
  avgWins: number;
  avgRank: number;
  titles: number;
  bestRun: Run | null;
  favoritePlayer: { name: string; count: number } | null;
}

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<{ runs: Run[]; stats: Stats } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the user's runs when auth resolves
    setFetching(true);
    fetch("/api/runs", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (active) setData(d);
      })
      .finally(() => {
        if (active) setFetching(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  return (
    <div className="relative min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <nav className="mb-5 flex items-center justify-between">
          <Link href="/" className="font-display text-2xl leading-none">
            IPL Perfect Season
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/play" className="font-mono text-xs underline-offset-2 hover:underline" style={{ color: "var(--ink-soft)" }}>
              Play
            </Link>
            <ThemeToggle />
          </div>
        </nav>
        <div className="rule-double mb-6" />

        <div className="mb-5 flex items-baseline gap-3">
          <h1 className="font-display text-4xl sm:text-5xl">My runs</h1>
        </div>

        {loading ? (
          <p className="font-mono text-sm" style={{ color: "var(--ink-faint)" }}>
            Loading…
          </p>
        ) : !user ? (
          <div className="sheet p-7 text-center">
            <p className="mb-4" style={{ color: "var(--ink-soft)" }}>
              Sign in to keep a history of every season you play — your best run, your record, and the
              player you draft the most.
            </p>
            <button
              onClick={() => setShowSignIn(true)}
              className="font-display print-shadow px-8 py-3 text-lg"
              style={{ background: "var(--spot)", color: "var(--spot-ink)" }}
            >
              Sign in
            </button>
          </div>
        ) : !data || data.runs.length === 0 ? (
          <div className="sheet p-7 text-center">
            <p className="mb-4" style={{ color: "var(--ink-soft)" }}>
              {fetching ? "Loading your runs…" : "No runs yet. Play a season and it'll be saved here."}
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
            <Highlights stats={data.stats} />
            <h2 className="eyebrow mb-2 mt-8">All runs · {data.stats.totalRuns}</h2>
            <div className="flex flex-col gap-px" style={{ background: "var(--rule)" }}>
              {data.runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          </>
        )}
      </div>

      <AnimatePresence>{showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}</AnimatePresence>
    </div>
  );
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

function RunRow({ run }: { run: Run }) {
  const theme = TIER_THEME[run.tier];
  const date = new Date(run.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="p-3" style={{ background: "var(--paper-2)" }}>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0" style={{ background: theme.accent }} />
        <span className="font-display text-lg leading-none" style={{ color: theme.accent }}>
          {theme.label}
        </span>
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
    </div>
  );
}
