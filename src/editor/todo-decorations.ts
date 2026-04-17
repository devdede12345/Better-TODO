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
import katex from "katex";

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

// ─── Markdown inline mark decorations ────────────────────────────────────────

const boldContentDeco = Decoration.mark({
  attributes: { style: "font-weight: bold; color: #cdd6f4;" },
});

const boldMarkerDeco = Decoration.mark({
  attributes: { style: "opacity: 0.3; font-size: 0.85em;" },
});

const italicContentDeco = Decoration.mark({
  attributes: { style: "font-style: italic; color: #cdd6f4;" },
});

const italicMarkerDeco = Decoration.mark({
  attributes: { style: "opacity: 0.3; font-size: 0.85em;" },
});

const strikethroughContentDeco = Decoration.mark({
  attributes: { style: "text-decoration: line-through; opacity: 0.6;" },
});

const strikethroughMarkerDeco = Decoration.mark({
  attributes: { style: "opacity: 0.3; font-size: 0.85em;" },
});

const inlineCodeContentDeco = Decoration.mark({
  attributes: {
    style:
      "background: rgba(108,112,134,0.2); border-radius: 3px; padding: 1px 5px; font-family: inherit; font-size: 0.92em; color: #fab387;",
  },
});

const inlineCodeMarkerDeco = Decoration.mark({
  attributes: { style: "opacity: 0.3; font-size: 0.85em;" },
});

// Markdown inline patterns: *bold*, _italic_, ~strikethrough~, `code`
const MD_BOLD_RE = /(?<!\*)\*([^*\n]+)\*(?!\*)/g;
const MD_ITALIC_RE = /(?<!_)_([^_\n]+)_(?!_)/g;
const MD_STRIKE_RE = /(?<!~)~([^~\n]+)~(?!~)/g;
const MD_CODE_RE = /(?<!`)`([^`\n]+)`(?!`)/g;

// ─── Math widget ─────────────────────────────────────────────────────────────

class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly displayMode: boolean
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement(this.displayMode ? "div" : "span");
    wrapper.className = "cm-math-widget";
    if (this.displayMode) {
      wrapper.style.cssText =
        "display: block; text-align: center; padding: 8px 0; cursor: default;";
    } else {
      wrapper.style.cssText =
        "display: inline-block; vertical-align: middle; cursor: default; padding: 0 2px;";
    }
    try {
      wrapper.innerHTML = katex.renderToString(this.tex, {
        displayMode: this.displayMode,
        throwOnError: false,
        output: "html",
      });
    } catch {
      wrapper.textContent = this.tex;
      wrapper.style.color = "#f38ba8";
    }
    return wrapper;
  }

  eq(other: MathWidget): boolean {
    return this.tex === other.tex && this.displayMode === other.displayMode;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// Math patterns: $$...$$ (display) and $...$ (inline) — single line only
const MATH_DISPLAY_RE = /\$\$([^$]+?)\$\$/g;
const MATH_INLINE_RE = /(?<!\$)\$([^$\n]+?)\$(?!\$)/g;

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
      const nested = p.children.filter((c): c is (typeof parsed.projects)[0] => "name" in c);
      collectProjects(nested);
    }
  }
  collectProjects(parsed.projects);

  // Track ranges already occupied by math widgets to avoid overlapping markdown decos
  const mathRanges: { from: number; to: number }[] = [];

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

      // ── Math widget decorations (process before markdown to claim ranges) ──
      // Display math: $$...$$
      MATH_DISPLAY_RE.lastIndex = 0;
      let mathMatch: RegExpExecArray | null;
      while ((mathMatch = MATH_DISPLAY_RE.exec(text)) !== null) {
        const mFrom = line.from + mathMatch.index;
        const mTo = mFrom + mathMatch[0].length;
        mathRanges.push({ from: mFrom, to: mTo });
        decos.push(
          Decoration.replace({
            widget: new MathWidget(mathMatch[1], true),
          }).range(mFrom, mTo)
        );
      }

      // Inline math: $...$
      MATH_INLINE_RE.lastIndex = 0;
      while ((mathMatch = MATH_INLINE_RE.exec(text)) !== null) {
        const mFrom = line.from + mathMatch.index;
        const mTo = mFrom + mathMatch[0].length;
        // Skip if overlapping with display math
        if (mathRanges.some((r) => mFrom < r.to && mTo > r.from)) continue;
        mathRanges.push({ from: mFrom, to: mTo });
        decos.push(
          Decoration.replace({
            widget: new MathWidget(mathMatch[1], false),
          }).range(mFrom, mTo)
        );
      }

      // ── Markdown inline decorations ──
      // Bold: *text*
      addMarkdownDecos(
        text, line.from, MD_BOLD_RE,
        boldMarkerDeco, boldContentDeco, 1,
        decos, mathRanges
      );
      // Italic: _text_
      addMarkdownDecos(
        text, line.from, MD_ITALIC_RE,
        italicMarkerDeco, italicContentDeco, 1,
        decos, mathRanges
      );
      // Strikethrough: ~text~
      addMarkdownDecos(
        text, line.from, MD_STRIKE_RE,
        strikethroughMarkerDeco, strikethroughContentDeco, 1,
        decos, mathRanges
      );
      // Inline code: `text`
      addMarkdownDecos(
        text, line.from, MD_CODE_RE,
        inlineCodeMarkerDeco, inlineCodeContentDeco, 1,
        decos, mathRanges
      );

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

// Helper: add markdown mark decorations (dim markers + styled content)
function addMarkdownDecos(
  text: string,
  lineFrom: number,
  regex: RegExp,
  markerDeco: Decoration,
  contentDeco: Decoration,
  markerLen: number,
  decos: Range<Decoration>[],
  mathRanges: { from: number; to: number }[]
) {
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const mFrom = lineFrom + m.index;
    const mTo = mFrom + m[0].length;
    // Skip if overlapping with math
    if (mathRanges.some((r) => mFrom < r.to && mTo > r.from)) continue;
    // Opening marker
    decos.push(markerDeco.range(mFrom, mFrom + markerLen));
    // Content
    decos.push(contentDeco.range(mFrom + markerLen, mTo - markerLen));
    // Closing marker
    decos.push(markerDeco.range(mTo - markerLen, mTo));
  }
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
