import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";

// Theme tokens driven by CSS variables so editor follows global light/dark mode.
const colors = {
  bg: "rgb(var(--editor-bg))",
  fg: "rgb(var(--editor-text))",
  comment: "rgb(var(--editor-muted))",
  green: "rgb(var(--editor-green))",
  red: "rgb(var(--editor-red))",
  yellow: "rgb(var(--editor-yellow))",
  blue: "rgb(var(--editor-accent))",
  purple: "rgb(var(--editor-mauve))",
  cyan: "rgb(var(--editor-teal))",
  orange: "rgb(var(--editor-peach))",
  pink: "rgb(var(--editor-pink))",
  surface0: "rgb(var(--editor-border))",
  surface1: "rgb(var(--editor-overlay))",
  overlay: "rgb(var(--editor-muted))",
};

export const todoEditorTheme = EditorView.theme(
  {
    "&": {
      color: colors.fg,
      backgroundColor: colors.bg,
    },
    ".cm-content": {
      caretColor: colors.blue,
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: colors.blue,
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "rgb(var(--editor-accent) / 0.18)",
      },
    ".cm-panels": {
      backgroundColor: "rgb(var(--editor-surface))",
      color: colors.fg,
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: `1px solid ${colors.surface0}`,
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: `1px solid ${colors.surface0}`,
    },
    ".cm-searchMatch": {
      backgroundColor: "rgb(var(--editor-yellow) / 0.28)",
      outline: "1px solid rgb(var(--editor-yellow) / 0.5)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgb(var(--editor-yellow) / 0.46)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgb(var(--editor-surface) / 0.55)",
    },
    ".cm-selectionMatch": {
      backgroundColor: "rgb(var(--editor-accent) / 0.12)",
    },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "rgb(var(--editor-accent) / 0.22)",
    },
    ".cm-gutters": {
      backgroundColor: colors.bg,
      color: colors.overlay,
      border: "none",
      borderRight: `1px solid ${colors.surface0}`,
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgb(var(--editor-surface))",
      color: colors.fg,
    },
    ".cm-foldPlaceholder": {
      backgroundColor: colors.surface0,
      color: colors.fg,
      border: "none",
    },
    ".cm-tooltip": {
      border: `1px solid ${colors.surface0}`,
      backgroundColor: "rgb(var(--editor-surface))",
      color: colors.fg,
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: colors.surface0,
      borderBottomColor: colors.surface0,
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: "rgb(var(--editor-surface))",
      borderBottomColor: "rgb(var(--editor-surface))",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        backgroundColor: colors.surface0,
        color: colors.fg,
      },
    },
    // Custom todo-plus token styles
    ".tok-todo-done-marker": {
      color: colors.green,
      fontWeight: "bold",
    },
    ".tok-todo-cancelled-marker": {
      color: colors.red,
      fontWeight: "bold",
    },
    ".tok-todo-pending-marker": {
      color: colors.blue,
      fontWeight: "bold",
    },
    ".tok-todo-bullet": {
      color: colors.overlay,
    },
    ".tok-todo-tag-done": {
      color: colors.green,
      fontStyle: "italic",
    },
    ".tok-todo-tag-cancelled": {
      color: colors.red,
      fontStyle: "italic",
    },
    ".tok-todo-tag-critical": {
      color: "#1e1e2e",
      backgroundColor: colors.red,
      fontWeight: "bold",
      borderRadius: "3px",
      padding: "0 4px",
    },
    ".tok-todo-tag-low": {
      color: colors.comment,
      fontStyle: "italic",
      backgroundColor: "rgb(var(--editor-muted) / 0.15)",
      borderRadius: "3px",
      padding: "0 4px",
    },
    ".tok-todo-tag-due": {
      color: "#1e1e2e",
      backgroundColor: colors.orange,
      fontWeight: "bold",
      borderRadius: "3px",
      padding: "0 4px",
    },
    ".tok-todo-tag-started": {
      color: "#1e1e2e",
      backgroundColor: colors.yellow,
      borderRadius: "3px",
      padding: "0 4px",
    },
    ".tok-todo-tag-today": {
      color: "#1e1e2e",
      backgroundColor: colors.pink,
      fontWeight: "bold",
      borderRadius: "3px",
      padding: "0 4px",
    },
    ".tok-todo-tag": {
      color: colors.yellow,
    },
    ".tok-todo-project": {
      color: colors.purple,
    },
    ".tok-todo-priority": {
      color: colors.orange,
      fontWeight: "bold",
    },
    ".tok-heading": {
      color: colors.blue,
      fontWeight: "bold",
      fontSize: "1.05em",
    },
    ".tok-keyword": {
      color: colors.purple,
      fontWeight: "bold",
      fontSize: "1.05em",
    },
    ".tok-url": {
      color: colors.blue,
      textDecoration: "underline",
    },
  }
);

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: colors.purple, fontWeight: "bold" },
  { tag: tags.heading, color: colors.blue, fontWeight: "bold" },
  { tag: tags.comment, color: colors.comment },
  { tag: tags.string, color: colors.green },
  { tag: tags.url, color: colors.blue },
]);

export const todoHighlighting = syntaxHighlighting(highlightStyle);
