import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

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

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;

      if (text.includes("✔") || text.match(/@done/)) {
        builder.add(line.from, line.from, doneLineDeco);
      } else if (text.includes("✘") || text.match(/@cancelled/)) {
        builder.add(line.from, line.from, cancelledLineDeco);
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
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
