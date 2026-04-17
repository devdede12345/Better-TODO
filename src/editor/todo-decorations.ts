import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { Range } from "@codemirror/state";
import { parseTodoDocument, formatMinutes } from "./todoParser";

// ─── Line-level decorations ──────────────────────────────────────────────────

const doneLineDeco = Decoration.line({
  attributes: {
    style: "opacity: 0.5; text-decoration: line-through; text-decoration-color: #a6e3a1;",
  },
});

const cancelledLineDeco = Decoration.line({
  attributes: {
    style: "opacity: 0.4; text-decoration: line-through; text-decoration-color: #f38ba8;",
  },
});

const criticalLineDeco = Decoration.line({
  attributes: {
    style: "border-left: 3px solid #f38ba8; padding-left: 4px;",
  },
});

const highLineDeco = Decoration.line({
  attributes: {
    style: "border-left: 3px solid #fab387; padding-left: 4px;",
  },
});

// ─── Inline mark decorations for tags ────────────────────────────────────────

const tagDecoMap: Record<string, Decoration> = {
  critical: Decoration.mark({
    attributes: {
      style:
        "color: #1e1e2e; background: #f38ba8; font-weight: bold; border-radius: 3px; padding: 0 4px;",
    },
  }),
  high: Decoration.mark({
    attributes: {
      style:
        "color: #1e1e2e; background: #fab387; font-weight: bold; border-radius: 3px; padding: 0 4px;",
    },
  }),
  low: Decoration.mark({
    attributes: {
      style:
        "color: #6c7086; font-style: italic; background: rgba(108,112,134,0.15); border-radius: 3px; padding: 0 4px;",
    },
  }),
  today: Decoration.mark({
    attributes: {
      style:
        "color: #1e1e2e; background: #cba6f7; font-weight: bold; border-radius: 3px; padding: 0 4px;",
    },
  }),
  done: Decoration.mark({
    attributes: { style: "color: #a6e3a1; font-style: italic;" },
  }),
  cancelled: Decoration.mark({
    attributes: { style: "color: #f38ba8; font-style: italic;" },
  }),
};

const markerDeco = Decoration.mark({
  attributes: { style: "cursor: pointer;" },
});

// ─── Project stats widget ────────────────────────────────────────────────────

class ProjectStatsWidget extends WidgetType {
  constructor(
    readonly pending: number,
    readonly est: string
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.style.cssText =
      "margin-left: 8px; font-size: 0.85em; opacity: 0.6; color: #89b4fa; pointer-events: none;";
    const parts: string[] = [];
    if (this.pending > 0) parts.push(`${this.pending} pending`);
    if (this.est) parts.push(this.est);
    span.textContent = parts.length > 0 ? `(${parts.join(", ")})` : "";
    return span;
  }

  eq(other: ProjectStatsWidget): boolean {
    return this.pending === other.pending && this.est === other.est;
  }
}

// ─── Inline tag regex (matches @tag or @tag(value)) ─────────────────────────

const TAG_RE = /@(critical|high|low|today|done|cancelled|canceled)(?:\([^)]*\))?/g;

// ─── Build decorations ──────────────────────────────────────────────────────

function buildDecorations(view: EditorView): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const doc = view.state.doc;
  const fullText = doc.toString();

  // Parse once for project stats
  const parsed = parseTodoDocument(fullText);

  // Build a line-number → project map for stat widgets
  const projectByLine = new Map<number, (typeof parsed.projects)[0]>();
  function collectProjects(projects: typeof parsed.projects) {
    for (const p of projects) {
      projectByLine.set(p.line, p);
      // Recurse into nested projects in children
      const nested = p.children.filter((c): c is (typeof parsed.projects)[0] => "name" in c);
      collectProjects(nested);
    }
  }
  collectProjects(parsed.projects);

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      const text = line.text;
      const lineIdx = line.number - 1; // 0-indexed

      // ── Line-level decorations ──
      if (text.includes("✔") || /@done/.test(text)) {
        decos.push(doneLineDeco.range(line.from));
      } else if (text.includes("✘") || /@cancelled/.test(text)) {
        decos.push(cancelledLineDeco.range(line.from));
      }

      // Priority line accents
      if (/@critical/.test(text)) {
        decos.push(criticalLineDeco.range(line.from));
      } else if (/@high/.test(text)) {
        decos.push(highLineDeco.range(line.from));
      }

      // ── Inline tag mark decorations ──
      TAG_RE.lastIndex = 0;
      let tagMatch: RegExpExecArray | null;
      while ((tagMatch = TAG_RE.exec(text)) !== null) {
        const tagName = tagMatch[1] === "canceled" ? "cancelled" : tagMatch[1];
        const deco = tagDecoMap[tagName];
        if (deco) {
          const tagFrom = line.from + tagMatch.index;
          const tagTo = tagFrom + tagMatch[0].length;
          decos.push(deco.range(tagFrom, tagTo));
        }
      }

      // ── Clickable marker decoration (cursor: pointer) ──
      const markers = ["☐", "✔", "✘"];
      for (const marker of markers) {
        const idx = text.indexOf(marker);
        if (idx !== -1) {
          const markerFrom = line.from + idx;
          const markerTo = markerFrom + marker.length;
          decos.push(markerDeco.range(markerFrom, markerTo));
        }
      }

      // ── Project stats widget ──
      const proj = projectByLine.get(lineIdx);
      if (proj) {
        const est = formatMinutes(proj.stats.estMinutes);
        if (proj.stats.pending > 0 || est) {
          decos.push(
            Decoration.widget({
              widget: new ProjectStatsWidget(proj.stats.pending, est),
              side: 1,
            }).range(line.to)
          );
        }
      }

      pos = line.to + 1;
    }
  }

  return Decoration.set(decos, true);
}

export const todoDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
