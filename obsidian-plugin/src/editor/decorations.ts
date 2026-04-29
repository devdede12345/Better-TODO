import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { Range } from "@codemirror/state";

// ─── Line patterns ───────────────────────────────────────────────────────────

const RE_TODO_DONE = /^\s*✔\s+/;
const RE_TODO_CANCELLED = /^\s*✘\s+/;
const RE_TODO_PENDING = /^\s*☐\s+/;

// Markdown task list. We treat [x]/[X] as done and [-]/[/] as cancelled.
const RE_MD_TASK = /^\s*(?:[-*+]|\d+\.)\s+\[([ xX/\-])\]\s+/;

// ─── Decorations ─────────────────────────────────────────────────────────────

const doneLineDeco = Decoration.line({ attributes: { class: "btodo-done-line" } });
const cancelledLineDeco = Decoration.line({ attributes: { class: "btodo-cancelled-line" } });
const overdueDeco = Decoration.mark({ attributes: { class: "btodo-overdue" } });
const dueDeco = Decoration.mark({ attributes: { class: "btodo-due" } });
const lastedDeco = Decoration.mark({ attributes: { class: "btodo-lasted" } });
const doneTagDeco = Decoration.mark({ attributes: { class: "btodo-done-tag" } });

// ─── Date helpers (lightweight subset of TimelineView's parser) ──────────────

function parseTimestamp(str: string): Date | null {
  const trimmed = str.trim();
  let m = trimmed.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  m = trimmed.match(/^(\d{2})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?$/);
  if (m) {
    const yy = +m[1];
    const fullYear = yy < 70 ? 2000 + yy : 1900 + yy;
    const d = new Date(fullYear, +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Build decorations from the visible content ──────────────────────────────

function buildDecorations(view: EditorView): DecorationSet {
  const builder: Range<Decoration>[] = [];
  const now = Date.now();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;

      // Line-level: done / cancelled state → strikethrough class
      const mdMatch = text.match(RE_MD_TASK);
      const isDone = RE_TODO_DONE.test(text) || (mdMatch && /[xX]/.test(mdMatch[1]));
      const isCancelled =
        RE_TODO_CANCELLED.test(text) || (mdMatch && /[\-/]/.test(mdMatch[1]));

      if (isDone) builder.push(doneLineDeco.range(line.from));
      else if (isCancelled) builder.push(cancelledLineDeco.range(line.from));

      // Inline tag decorations
      // @done(...) → green tag, also strike-through (handled by line class)
      const doneRe = /@done\(([^)]*)\)/g;
      let mt: RegExpExecArray | null;
      while ((mt = doneRe.exec(text)) !== null) {
        builder.push(doneTagDeco.range(line.from + mt.index, line.from + mt.index + mt[0].length));
      }

      // @lasted(...) → grey/italic
      const lastedRe = /@lasted\(([^)]*)\)/g;
      while ((mt = lastedRe.exec(text)) !== null) {
        builder.push(lastedDeco.range(line.from + mt.index, line.from + mt.index + mt[0].length));
      }

      // @due(...) → overdue if past due AND task not done
      const dueRe = /@due\(([^)]+)\)/g;
      while ((mt = dueRe.exec(text)) !== null) {
        const date = parseTimestamp(mt[1]);
        const start = line.from + mt.index;
        const end = start + mt[0].length;
        if (!isDone && !isCancelled && date && date.getTime() < now) {
          builder.push(overdueDeco.range(start, end));
        } else {
          builder.push(dueDeco.range(start, end));
        }
      }

      pos = line.to + 1;
      if (pos > to) break;
    }
  }

  // Decorations must be sorted by from-position. The line-level decoration
  // for a line shares the same `from` as inline marks on that line, so we
  // need to sort to produce a stable ordering.
  builder.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(builder, true);
}

export const todoDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);
