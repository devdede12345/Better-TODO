import { useSyncExternalStore } from "react";

// ─── Shared category → color store ──────────────────────────────────────────
//
// User-chosen colours for task sections (e.g. "Project Better TODO:" in .todo
// files).  The store is persisted in localStorage and is consumed by:
//   - TimelineView  (task bars, category legend, focus panel, buckets)
//   - CalendarView  (events and multi-day spans)
//   - TodoEditor    (optional coloured indicator on section headers)
//
// Keys are the raw category names captured by `buildCategoryMapFromContent`
// (i.e. the section header text without the trailing `:`).  Values are CSS
// hex colours from `CATEGORY_PALETTE` — callers may also store arbitrary
// hex colours should we later add a full colour picker.

const STORAGE_KEY = "category-colors";

type Colors = Record<string, string>;

function load(): Colors {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

let cache: Colors = load();
const listeners = new Set<() => void>();

export function getCustomCategoryColors(): Colors {
  return cache;
}

export function getCategoryColor(name: string): string | null {
  return cache[name] ?? null;
}

export function setCategoryColor(name: string, color: string | null): void {
  const next: Colors = { ...cache };
  if (color === null) delete next[name];
  else next[name] = color;
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
  for (const l of listeners) l();
}

export function subscribeCategoryColors(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** React hook: rerender when any category colour changes. */
export function useCategoryColors(): Colors {
  return useSyncExternalStore(
    subscribeCategoryColors,
    getCustomCategoryColors,
    getCustomCategoryColors
  );
}

export const CATEGORY_PALETTE = [
  "#a6e3a1", // green
  "#94e2d5", // teal
  "#89b4fa", // blue
  "#cba6f7", // mauve
  "#f5c2e7", // pink
  "#f38ba8", // red
  "#fab387", // peach
  "#f9e2af", // yellow
];
