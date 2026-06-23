"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MAX_OVERSEAS, MIN_BOWLING_OPTIONS, XI_SIZE } from "@/engine/rules";
import { ThemeToggle } from "./components/ThemeToggle";
import { AccountNav } from "./components/AccountNav";
import { CrestTicker } from "./components/HeroReel";
import { Analytics } from "@vercel/analytics/next"

const TIERS = [
  "Wooden Spoon",
  "Mid-Table",
  "Playoff Bound",
  "Finalist",
  "Champions",
  "Unbeaten League Stage",
  "Perfect Season",
];

export default function FrontPage() {
  const [difficulty, setDifficulty] = useState<"easy" | "hard">("easy");
  const [showHowTo, setShowHowTo] = useState(false);

  return (
    <div className="relative min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        {/* ── Top bar ─────────────────────────────────────────────── */}
        <nav className="mb-6 flex items-center justify-between">
          <span className="eyebrow">Est. spin one</span>
          <div className="flex items-center gap-3">
            <AccountNav />
            <ThemeToggle />
          </div>
        </nav>

        {/* ── Programme cover ─────────────────────────────────────── */}
        <header className="sheet print-shadow relative overflow-hidden p-7 sm:p-12">
          <div className="absolute right-0 top-0 h-full w-2" style={{ background: "var(--spot)" }} />
          <div className="flex items-center justify-between">
            <span className="eyebrow">IPL Perfect Season</span>
            <span className="eyebrow">Est. 2026</span>
          </div>
          <div className="rule-double my-4" />
          <h1 className="font-display text-5xl leading-[0.9] sm:text-8xl">
            {["IPL", "Perfect", "Season"].map((word, i) => (
              <motion.span
                key={word}
                className="block"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                style={i === 2 ? { color: "var(--spot)" } : undefined}
              >
                {word}
              </motion.span>
            ))}
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            No IPL team can claim a perfect season — but you can. Spin the wheel, draft real IPL legends from any season in history, and chase an unbeaten,
            title-winning campaign.
          </p>

          {/* Difficulty */}
          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DifficultyCard
              label="Easy"
              description="Ratings and stats visible while you draft."
              selected={difficulty === "easy"}
              onSelect={() => setDifficulty("easy")}
            />
            <DifficultyCard
              label="Hard"
              description="Ratings hidden during the draft — pure cricket knowledge."
              selected={difficulty === "hard"}
              onSelect={() => setDifficulty("hard")}
            />
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <motion.a
              href={`/play?difficulty=${difficulty}`}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="font-display print-shadow inline-block px-10 py-4 text-2xl"
              style={{ background: "var(--spot)", color: "var(--spot-ink)" }}
            >
              Play →
            </motion.a>
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowHowTo(true)}
              className="font-display px-6 py-4 text-lg"
              style={{ border: "1.5px solid var(--ink)", color: "var(--ink)" }}
            >
              How to play
            </motion.button>
          </div>

          {/* Crest ticker */}
          <div className="-mx-7 mt-7 border-t-[1.5px] border-[var(--ink)] sm:-mx-12">
            <CrestTicker />
          </div>
        </header>

        <p className="mt-6 text-center eyebrow" style={{ color: "var(--ink-faint)" }}>
          Fan-made · monogram crests · real numbers
        </p>
      </div>

      <AnimatePresence>{showHowTo && <HowToPlay onClose={() => setShowHowTo(false)} />}</AnimatePresence>
      <Analytics />
    </div>
  );
}

function HowToPlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
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
      aria-label="How to play"
    >
      <motion.div
        className="sheet print-shadow my-auto w-full max-w-2xl"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal masthead */}
        <div className="flex items-center justify-between border-b-[1.5px] border-[var(--ink)] px-6 py-4">
          <h2 className="font-display text-2xl">How to play</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="font-mono flex h-8 w-8 items-center justify-center text-lg"
            style={{ border: "1.5px solid var(--ink)" }}
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6 sm:p-7">
          <Section title="The loop" index="A">
            <Step n={1} title="Spin">
              The wheel lands on a real franchise and a real season — say, Chennai Super Kings, 2010.
            </Step>
            <Step n={2} title="Draft">
              Pick a player from that squad, then choose where they bat. Repeat {XI_SIZE} times. Two
              single-use rerolls swap just the team or just the year.
            </Step>
            <Step n={3} title="Build a balanced XI">
              Every player is tagged by where they really batted. You can only field them in those
              positions, so a finisher can&rsquo;t open and your tail has to bowl.
            </Step>
            <Step n={4} title="Play the season">
              Watch a deterministic 14-game league against random sides from across IPL history, then
              a playoff gauntlet that ends against the greatest XI ever assembled.
            </Step>
          </Section>

          <Section title="XI rules" index="B">
            <Rule>Exactly {XI_SIZE} players — no more, no fewer.</Rule>
            <Rule>Max {MAX_OVERSEAS} overseas players, the real IPL composition rule.</Rule>
            <Rule>At least one wicketkeeper, up to two.</Rule>
            <Rule>At least {MIN_BOWLING_OPTIONS} bowling options to cover all 20 overs.</Rule>
            <Rule>Bat players only in their role: Top 1&ndash;3, Middle 3&ndash;7, Finisher 3&ndash;8, Lower 7&ndash;11.</Rule>
            <Rule>No drafting the same real person twice.</Rule>
          </Section>

          <Section title="Result ladder" index="C">
            <ol className="space-y-0">
              {TIERS.map((tier, i) => {
                const isTop = i === TIERS.length - 1;
                return (
                  <li key={tier} className="flex items-center gap-3 py-2" style={{ borderTop: "1px solid var(--rule)" }}>
                    <span className="font-mono text-xs w-6" style={{ color: "var(--ink-faint)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={isTop ? "font-display text-lg" : "text-sm"} style={{ color: isTop ? "var(--spot)" : "var(--ink)" }}>
                      {tier}
                    </span>
                    {isTop && (
                      <span className="eyebrow ml-auto" style={{ color: "var(--ink-faint)" }}>
                        fires confetti
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </Section>
        </div>

        <div className="border-t-[1.5px] border-[var(--ink)] px-6 py-4">
          <button
            onClick={onClose}
            className="font-display w-full py-3 text-lg"
            style={{ background: "var(--spot)", color: "var(--spot-ink)" }}
          >
            Got it — let&rsquo;s spin
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Section({ title, index, children }: { title: string; index: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <div className="mb-4 flex items-baseline gap-3">
        <span
          className="font-display flex h-7 w-7 shrink-0 items-center justify-center text-base"
          style={{ background: "var(--ink)", color: "var(--paper-2)" }}
        >
          {index}
        </span>
        <h3 className="font-display text-2xl">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex gap-4 last:mb-0">
      <span className="font-mono text-sm pt-0.5 w-8 shrink-0" style={{ color: "var(--spot)" }}>
        {String(n).padStart(2, "0")}
      </span>
      <div>
        <div className="font-display text-lg leading-none">{title}</div>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {children}
        </p>
      </div>
    </div>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex gap-3 text-sm last:mb-0" style={{ color: "var(--ink-soft)" }}>
      <span style={{ color: "var(--spot)" }}>■</span>
      <span>{children}</span>
    </div>
  );
}

function DifficultyCard({
  label,
  description,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="text-left p-4 transition-all"
      style={{
        background: selected ? "var(--ink)" : "var(--paper-3)",
        color: selected ? "var(--paper-2)" : "var(--ink)",
        border: "1.5px solid var(--ink)",
      }}
    >
      <div className="font-display text-xl leading-none">{label}</div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: selected ? "var(--rule)" : "var(--ink-soft)" }}>
        {description}
      </p>
    </button>
  );
}
