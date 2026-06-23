"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { useAuth } from "./AuthProvider";
import { SignInModal } from "./SignInModal";

const chip = "font-mono px-2.5 py-1 text-xs transition-colors";
const chipStyle = { border: "1.5px solid var(--ink)", color: "var(--ink)" } as const;

export function AccountNav() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>…</span>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/history" className={chip} style={chipStyle}>
          My runs
        </Link>
        <span className={chip} style={{ ...chipStyle, color: "var(--ink-soft)" }} title={user.email}>
          {user.name || user.email}
        </span>
        <button onClick={logout} className={chip} style={chipStyle}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={chip} style={chipStyle}>
        Sign in
      </button>
      <AnimatePresence>{open && <SignInModal onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
