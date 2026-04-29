import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";

/**
 * .todo-style editing actions ported into a CodeMirror 6 keymap so they
 * apply inside Obsidian's Markdown editor (live preview AND source mode).
 *
 * Both task syntaxes are supported on every action:
 *   • Markdown task lists: `- [ ]`, `- [x]`, `- [-]`
 *   • .todo glyphs:        `☐`, `✔`, `✘`
 *
 * When a fresh task is inserted from a non-task line, the Markdown form
 * (`- [ ] `) is used so the file remains compatible with Obsidian's native
 * task rendering. On lines that already use glyphs, the same glyph style
 * is preserved.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function timestamp(date = new Date()): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function parseTimestamp(str: string): Date | null {
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

function computeLasted(text: string, doneAt: string): string | null {
  const sm = text.match(/@started\(([^)]+)\)/);
  if (!sm) return null;
  const start = parseTimestamp(sm[1].trim());
  const end = parseTimestamp(doneAt);
  if (!start || !end) return null;
  const diffMin = Math.round((end.getTime() - start.getTime()) / 60000);
  if (diffMin <= 0) return null;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h > 0 && m > 0) return `@lasted(${h}h${m}m)`;
  if (h > 0) return `@lasted(${h}h)`;
  return `@lasted(${m}m)`;
}

// ─── Task line shape detection ──────────────────────────────────────────────

interface TaskShape {
  /** Style of the task marker on this line. */
  style: "md" | "glyph";
  /** Current state. */
  state: "pending" | "done" | "cancelled";
  /** Absolute document offset where the marker character(s) start. */
  markerFrom: number;
  /** Absolute document offset right after the marker. */
  markerTo: number;
  /** Length and content of the marker that should be replaced when toggling. */
  markerText: string;
}

const RE_MD_TASK = /^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX/\-])\](\s+)/;
const RE_TODO_GLYPH = /^(\s*)([☐✔✘])(\s+)/;

function detectTaskShape(text: string, lineFrom: number): TaskShape | null {
  const md = text.match(RE_MD_TASK);
  if (md) {
    const ch = md[2];
    const state =
      ch === "x" || ch === "X" ? "done" :
      ch === "-" || ch === "/" ? "cancelled" :
      "pending";
    const markerFrom = lineFrom + md[1].length;     // position of '['
    const markerTo = markerFrom + 3;                // covers '[ ]' / '[x]' / '[-]'
    return { style: "md", state, markerFrom, markerTo, markerText: `[${ch}]` };
  }

  const td = text.match(RE_TODO_GLYPH);
  if (td) {
    const ch = td[2];
    const state =
      ch === "✔" ? "done" :
      ch === "✘" ? "cancelled" :
      "pending";
    const markerFrom = lineFrom + td[1].length;
    const markerTo = markerFrom + ch.length;
    return { style: "glyph", state, markerFrom, markerTo, markerText: ch };
  }
  return null;
}

function markerFor(style: "md" | "glyph", state: "pending" | "done" | "cancelled"): string {
  if (style === "md") {
    return state === "done" ? "[x]" : state === "cancelled" ? "[-]" : "[ ]";
  }
  return state === "done" ? "✔" : state === "cancelled" ? "✘" : "☐";
}

// ─── Tag manipulation helpers ───────────────────────────────────────────────

interface Change { from: number; to: number; insert: string }

function appendTag(text: string, lineTo: number, tag: string, changes: Change[]) {
  if (text.includes(tag.split("(")[0])) return; // already has @done/@cancelled/...
  changes.push({ from: lineTo, to: lineTo, insert: ` ${tag}` });
}

function stripTag(text: string, lineFrom: number, re: RegExp, changes: Change[]) {
  const m = text.match(re);
  if (!m) return;
  const idx = lineFrom + text.indexOf(m[0]);
  changes.push({ from: idx, to: idx + m[0].length, insert: "" });
}

// ─── Toggle done (Ctrl+D): pending → done → cancelled → pending ─────────────

function toggleDone(view: EditorView): boolean {
  const { state } = view;
  const changes: Change[] = [];
  const seen = new Set<number>();

  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    if (seen.has(line.from)) continue;
    seen.add(line.from);

    const text = line.text;
    const now = timestamp();
    const shape = detectTaskShape(text, line.from);

    if (!shape) {
      // Plain bullet → convert to pending task, then mark done in one step
      const bullet = text.match(/^(\s*)([-*+]\s+)/);
      if (bullet) {
        const idx = line.from + bullet[1].length;
        changes.push({
          from: idx,
          to: idx + bullet[2].length,
          insert: `${bullet[2].trimEnd()} [x] `,
        });
        appendTag(text, line.to, `@done(${now})`, changes);
      }
      continue;
    }

    if (shape.state === "pending") {
      // pending → done
      changes.push({
        from: shape.markerFrom,
        to: shape.markerTo,
        insert: markerFor(shape.style, "done"),
      });
      appendTag(text, line.to, `@done(${now})`, changes);
      const lasted = computeLasted(text, now);
      if (lasted && !text.includes("@lasted")) {
        changes.push({ from: line.to, to: line.to, insert: ` ${lasted}` });
      }
    } else if (shape.state === "done") {
      // done → cancelled
      changes.push({
        from: shape.markerFrom,
        to: shape.markerTo,
        insert: markerFor(shape.style, "cancelled"),
      });
      stripTag(text, line.from, / ?@done(\([^)]*\))?/, changes);
      stripTag(text, line.from, / ?@lasted(\([^)]*\))?/, changes);
      appendTag(text, line.to, `@cancelled(${now})`, changes);
    } else {
      // cancelled → pending
      changes.push({
        from: shape.markerFrom,
        to: shape.markerTo,
        insert: markerFor(shape.style, "pending"),
      });
      stripTag(text, line.from, / ?@cancel(?:led)?(\([^)]*\))?/, changes);
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

// ─── Toggle cancelled (Alt+C): pending ↔ cancelled ──────────────────────────

function toggleCancelled(view: EditorView): boolean {
  const { state } = view;
  const changes: Change[] = [];
  const seen = new Set<number>();

  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    if (seen.has(line.from)) continue;
    seen.add(line.from);

    const text = line.text;
    const now = timestamp();
    const shape = detectTaskShape(text, line.from);
    if (!shape) continue;

    if (shape.state === "cancelled") {
      // cancelled → pending
      changes.push({
        from: shape.markerFrom,
        to: shape.markerTo,
        insert: markerFor(shape.style, "pending"),
      });
      stripTag(text, line.from, / ?@cancel(?:led)?(\([^)]*\))?/, changes);
    } else {
      // pending or done → cancelled
      changes.push({
        from: shape.markerFrom,
        to: shape.markerTo,
        insert: markerFor(shape.style, "cancelled"),
      });
      // If we were done, drop @done / @lasted first
      if (shape.state === "done") {
        stripTag(text, line.from, / ?@done(\([^)]*\))?/, changes);
        stripTag(text, line.from, / ?@lasted(\([^)]*\))?/, changes);
      }
      appendTag(text, line.to, `@cancelled(${now})`, changes);
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

// ─── Toggle @started tag (Alt+S) ────────────────────────────────────────────

function toggleStarted(view: EditorView): boolean {
  const { state } = view;
  const changes: Change[] = [];

  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    const text = line.text;
    const shape = detectTaskShape(text, line.from);
    // Only useful on pending tasks
    if (!shape || shape.state !== "pending") continue;

    const m = text.match(/ ?@started(\([^)]*\))?/);
    if (m) {
      const idx = line.from + text.indexOf(m[0]);
      changes.push({ from: idx, to: idx + m[0].length, insert: "" });
    } else {
      changes.push({ from: line.to, to: line.to, insert: ` @started(${timestamp()})` });
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

// ─── New task (Ctrl+Enter) ──────────────────────────────────────────────────

function newTask(view: EditorView): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const text = line.text;
  const indent = text.match(/^(\s*)/)?.[1] || "";

  // Pick style based on the current line; default to Markdown.
  const useGlyph = /^\s*[☐✔✘]\s/.test(text);
  const prefix = useGlyph ? "☐ " : "- [ ] ";

  const isEmpty = text.trim() === "";
  if (isEmpty) {
    const insert = `${indent}${prefix}`;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert },
      selection: { anchor: line.from + insert.length },
    });
    return true;
  }

  const insert = `\n${indent}${prefix}`;
  view.dispatch({
    changes: { from: line.to, to: line.to, insert },
    selection: { anchor: line.to + insert.length },
  });
  return true;
}

// ─── Click-to-toggle on the marker glyphs ───────────────────────────────────

const clickToggle = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;

    const line = view.state.doc.lineAt(pos);
    const offset = pos - line.from;
    const text = line.text;

    // Only activate when the click lands on one of our glyph markers.
    // Markdown checkboxes are already toggled by Obsidian's renderer.
    const markers = new Set(["☐", "✔", "✘"]);
    const at = text[offset];
    const before = offset > 0 ? text[offset - 1] : "";

    let marker = "";
    let idx = -1;
    if (markers.has(at)) { marker = at; idx = offset; }
    else if (markers.has(before)) { marker = before; idx = offset - 1; }
    else return false;

    event.preventDefault();
    const changes: Change[] = [];
    const now = timestamp();
    const absIdx = line.from + idx;

    if (marker === "☐") {
      changes.push({ from: absIdx, to: absIdx + 1, insert: "✔" });
      appendTag(text, line.to, `@done(${now})`, changes);
      const lasted = computeLasted(text, now);
      if (lasted && !text.includes("@lasted")) {
        changes.push({ from: line.to, to: line.to, insert: ` ${lasted}` });
      }
    } else if (marker === "✔") {
      changes.push({ from: absIdx, to: absIdx + 1, insert: "☐" });
      stripTag(text, line.from, / ?@done(\([^)]*\))?/, changes);
      stripTag(text, line.from, / ?@lasted(\([^)]*\))?/, changes);
    } else {
      changes.push({ from: absIdx, to: absIdx + 1, insert: "☐" });
      stripTag(text, line.from, / ?@cancel(?:led)?(\([^)]*\))?/, changes);
    }

    if (changes.length > 0) view.dispatch({ changes });
    return true;
  },
});

// ─── Public extension ───────────────────────────────────────────────────────

/**
 * High-precedence keymap so our bindings beat Obsidian's defaults
 * (e.g. Ctrl+Enter, which Obsidian otherwise uses to toggle checkboxes).
 */
export const todoKeymap = Prec.highest(
  keymap.of([
    { key: "Mod-Enter", run: newTask, preventDefault: true },
    { key: "Mod-d", run: toggleDone, preventDefault: true },
    { key: "Alt-c", run: toggleCancelled, preventDefault: true },
    { key: "Alt-s", run: toggleStarted, preventDefault: true },
  ])
);

export const todoClickToggle = clickToggle;

// Also exported so the plugin's command palette entries can reuse the logic
// instead of duplicating the regex-juggling.
export const todoActions = {
  newTask,
  toggleDone,
  toggleCancelled,
  toggleStarted,
};
