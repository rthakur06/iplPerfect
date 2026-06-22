// Presentation-only accent colors per franchise — purely a UI flourish (no crests/logos, in
// keeping with the text-only identity constraint). Loosely evokes each franchise's real colors.
export const FRANCHISE_COLORS: Record<string, string> = {
  CSK: "#FDB913",
  MI: "#2563eb",
  RCB: "#dc2626",
  KKR: "#7c3aed",
  SRH: "#f97316",
  DC: "#3b82f6",
  PBKS: "#ef4444",
  RR: "#ec4899",
  GT: "#0d9488",
  LSG: "#06b6d4",
  DECCAN: "#7c3aed",
  PUNE_WARRIORS: "#84cc16",
  KOCHI: "#a855f7",
  RISING_PUNE: "#f43f5e",
  GUJARAT_LIONS: "#fb923c",
};

export function franchiseColor(franchiseId: string): string {
  return FRANCHISE_COLORS[franchiseId] ?? "#10b981";
}
