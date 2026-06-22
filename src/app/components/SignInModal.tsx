"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useAuth } from "./AuthProvider";

export function SignInModal({ onClose }: { onClose: () => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = mode === "login" ? await login(email, password) : await register(email, password);
    setBusy(false);
    if (result.error) setError(result.error);
    else onClose();
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10, 8, 5, 0.55)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "login" ? "Sign in" : "Create account"}
    >
      <motion.div
        className="sheet print-shadow w-full max-w-sm"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-[1.5px] border-[var(--ink)] px-5 py-4">
          <h2 className="font-display text-2xl">{mode === "login" ? "Sign in" : "Create account"}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="font-mono flex h-7 w-7 items-center justify-center"
            style={{ border: "1.5px solid var(--ink)" }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="p-5">
          <p className="mb-4 text-sm" style={{ color: "var(--ink-soft)" }}>
            {mode === "login" ? "Sign in to track your runs across devices." : "Create an account to save your run history."}
          </p>

          <label className="eyebrow mb-1 block">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="mb-3 w-full px-3 py-2 text-sm outline-none"
            style={{ background: "var(--paper-3)", border: "1.5px solid var(--ink)", color: "var(--ink)" }}
          />

          <label className="eyebrow mb-1 block">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="w-full px-3 py-2 text-sm outline-none"
            style={{ background: "var(--paper-3)", border: "1.5px solid var(--ink)", color: "var(--ink)" }}
          />

          {error && (
            <p className="mt-3 px-3 py-2 text-sm" style={{ color: "var(--spot-ink)", background: "var(--spot-deep)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="font-display mt-4 w-full py-3 text-lg disabled:opacity-50"
            style={{ background: "var(--spot)", color: "var(--spot-ink)" }}
          >
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="font-mono mt-3 w-full text-center text-xs underline underline-offset-2"
            style={{ color: "var(--ink-soft)" }}
          >
            {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
