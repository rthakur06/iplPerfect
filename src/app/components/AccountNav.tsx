"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { useAuth } from "./AuthProvider";
import { SignInModal } from "./SignInModal";

const chip = "font-mono px-2.5 py-1 text-xs transition-colors";
const chipStyle = { border: "1.5px solid var(--ink)", color: "var(--ink)" } as const;

export function AccountNav() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Don't show a link to the page you're already on.
  const onLeaderboard = pathname === "/leaderboard";
  const onHistory = pathname === "/history";

  if (loading) {
    return <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>…</span>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {!onLeaderboard && (
          <Link href="/leaderboard" className={chip} style={{ ...chipStyle, color: "var(--spot-2-deep)" }}>
            Leaderboard
          </Link>
        )}
        {!onHistory && (
          <Link href="/history" className={chip} style={chipStyle}>
            My runs
          </Link>
        )}
        <button onClick={logout} className={chip} style={chipStyle}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      {!onLeaderboard && (
        <Link href="/leaderboard" className={chip} style={{ ...chipStyle, color: "var(--spot-2-deep)" }}>
          Leaderboard
        </Link>
      )}
      <button
        onClick={() => setOpen(true)}
        title="Save your runs and rank on the leaderboard"
        className="font-mono px-3 py-1 text-xs font-bold transition-colors"
        style={{ background: "var(--spot)", color: "var(--spot-ink)", border: "1.5px solid var(--spot)" }}
      >
        Sign in
      </button>
      <AnimatePresence>{open && <SignInModal onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
