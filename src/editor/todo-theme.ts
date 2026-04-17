import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";

// One Dark Pro / Catppuccin Mocha inspired palette
const colors = {
  bg: "#1e1e2e",
  fg: "#cdd6f4",
  comment: "#6c7086",
  green: "#a6e3a1",
  red: "#f38ba8",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  purple: "#cba6f7",
  cyan: "#94e2d5",
  orange: "#fab387",
  pink: "#f5c2e7",
  surface0: "#313244",
  surface1: "#45475a",
  overlay: "#585b70",
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
        backgroundColor: "rgba(137, 180, 250, 0.15)",
      },
    ".cm-panels": {
      backgroundColor: "#181825",
      color: colors.fg,
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: `1px solid ${colors.surface0}`,
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: `1px solid ${colors.surface0}`,
    },
    ".cm-searchMatch": {
      backgroundColor: "rgba(249, 226, 175, 0.3)",
      outline: "1px solid rgba(249, 226, 175, 0.5)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(249, 226, 175, 0.5)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(24, 24, 37, 0.5)",
    },
    ".cm-selectionMatch": {
      backgroundColor: "rgba(137, 180, 250, 0.1)",
    },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "rgba(137, 180, 250, 0.2)",
    },
    ".cm-gutters": {
      backgroundColor: colors.bg,
      color: colors.overlay,
      border: "none",
      borderRight: `1px solid ${colors.surface0}`,
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#181825",
      color: colors.fg,
    },
    ".cm-foldPlaceholder": {
      backgroundColor: colors.surface0,
      color: colors.fg,
      border: "none",
    },
    ".cm-tooltip": {
      border: `1px solid ${colors.surface0}`,
      backgroundColor: "#181825",
      color: colors.fg,
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: colors.surface0,
      borderBottomColor: colors.surface0,
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: "#181825",
      borderBottomColor: "#181825",
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
      backgroundColor: "rgba(108, 112, 134, 0.15)",
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
      color: colors.cyan,
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
  },
  { dark: true }
);

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: colors.purple, fontWeight: "bold" },
  { tag: tags.heading, color: colors.blue, fontWeight: "bold" },
  { tag: tags.comment, color: colors.comment },
  { tag: tags.string, color: colors.green },
  { tag: tags.url, color: colors.blue },
]);

export const todoHighlighting = syntaxHighlighting(highlightStyle);
