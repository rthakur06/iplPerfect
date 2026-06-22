import type { DraftState, SeasonResult } from "./types";

const SAVED_BUILDS_KEY = "ipl380:savedBuilds";
const DRAFT_HISTORY_KEY = "ipl380:draftHistory";

export interface SavedBuild {
  id: string;
  savedAt: string; // ISO timestamp
  draft: DraftState;
  result: SeasonResult;
}

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, items: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(items));
}

export function getSavedBuilds(): SavedBuild[] {
  return readList<SavedBuild>(SAVED_BUILDS_KEY);
}

export function saveBuild(build: SavedBuild): void {
  const builds = getSavedBuilds();
  writeList(SAVED_BUILDS_KEY, [...builds, build]);
}

export function getDraftHistory(): SeasonResult[] {
  return readList<SeasonResult>(DRAFT_HISTORY_KEY);
}

export function appendDraftHistory(result: SeasonResult): void {
  const history = getDraftHistory();
  writeList(DRAFT_HISTORY_KEY, [...history, result]);
}
