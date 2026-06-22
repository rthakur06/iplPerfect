"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { useAuth } from "./AuthProvider";
import { SignInModal } from "./SignInModal";

export function AccountNav() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>…</span>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <Link href="/history" className="font-mono text-xs underline-offset-2 hover:underline" style={{ color: "var(--ink-soft)" }}>
          My runs
        </Link>
        <span className="font-mono hidden text-xs sm:inline" style={{ color: "var(--ink-faint)" }} title={user.email}>
          {user.email}
        </span>
        <button onClick={logout} className="font-mono text-xs underline-offset-2 hover:underline" style={{ color: "var(--ink-soft)" }}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-mono px-2 py-1 text-xs"
        style={{ border: "1.5px solid var(--ink)", color: "var(--ink)" }}
      >
        Sign in
      </button>
      <AnimatePresence>{open && <SignInModal onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
