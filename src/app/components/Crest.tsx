import { crestCode, franchiseColor } from "../franchiseTheme";

// License-safe stand-ins for real crests/photos: a franchise-coloured monogram badge and a player
// initials avatar. Real images would slot into these same boxes if a licensed source is added.

export function FranchiseCrest({ franchiseId, size = 22 }: { franchiseId: string; size?: number }) {
  const color = franchiseColor(franchiseId);
  const code = crestCode(franchiseId);
  return (
    <span
      className="font-display inline-flex shrink-0 items-center justify-center leading-none"
      style={{
        width: size,
        height: size,
        background: color,
        color: "#fff",
        fontSize: size * 0.4,
        border: "1.5px solid var(--ink)",
        letterSpacing: "-0.02em",
      }}
      title={franchiseId}
      aria-hidden
    >
      {code.length > 3 ? code.slice(0, 3) : code}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z\s]/g, "").trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PlayerAvatar({ name, franchiseId, size = 30 }: { name: string; franchiseId?: string; size?: number }) {
  const ring = franchiseId ? franchiseColor(franchiseId) : "var(--border-bright)";
  return (
    <span
      className="font-mono inline-flex shrink-0 items-center justify-center rounded-full leading-none"
      style={{
        width: size,
        height: size,
        background: "var(--paper-3)",
        color: "var(--ink)",
        fontSize: size * 0.36,
        border: `2px solid ${ring}`,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
