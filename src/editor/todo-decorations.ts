import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { Range } from "@codemirror/state";

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

const markerDeco = Decoration.mark({
  attributes: {
    style: "cursor: pointer;",
  },
});

function buildDecorations(view: EditorView): DecorationSet {
  const decos: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;

      // Line-level decorations
      if (text.includes("✔") || /@done/.test(text)) {
        decos.push(doneLineDeco.range(line.from));
      } else if (text.includes("✘") || /@cancelled/.test(text)) {
        decos.push(cancelledLineDeco.range(line.from));
      }

      // Critical/high priority line accent
      if (/@(?:critical|high)/.test(text)) {
        decos.push(criticalLineDeco.range(line.from));
      }

      // Clickable marker decoration (cursor: pointer)
      const markers = ["☐", "✔", "✘"];
      for (const marker of markers) {
        const idx = text.indexOf(marker);
        if (idx !== -1) {
          const markerFrom = line.from + idx;
          const markerTo = markerFrom + marker.length;
          decos.push(markerDeco.range(markerFrom, markerTo));
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
