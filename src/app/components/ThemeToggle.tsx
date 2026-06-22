"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as Theme) || "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from the DOM attribute set by the no-flash script
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode — fall back to in-memory only */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
      className="font-mono px-2 py-1 text-xs transition-colors"
      style={{ border: "1.5px solid var(--ink)", color: "var(--ink)" }}
    >
      {theme === "dark" ? "☀ Day" : "☾ Night"}
    </button>
  );
}
