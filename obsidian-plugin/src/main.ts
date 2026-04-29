import { Plugin, MarkdownView, Editor, Notice, TFile } from "obsidian";
import { todoDecorations } from "./editor/decorations";
import {
  TimelineItemView,
  VIEW_TYPE_BTODO_TIMELINE,
} from "./views/TimelineItemView";

/**
 * Better TODO — Obsidian plugin entry point.
 *
 * Registers:
 *   • CodeMirror 6 extension that draws strikethroughs on done/cancelled
 *     tasks and highlights @due / @lasted / @done tags.
 *   • A custom Timeline view (right sidebar by default) that renders the
 *     active file's tasks on a Gantt-style chart.
 *   • Commands to toggle task state and to archive completed tasks.
 *
 * Supports two task syntaxes:
 *   1. Markdown — `- [ ]`, `- [x]`, `- [-]` / `- [/]`
 *   2. .todo glyphs — `☐`, `✔`, `✘`
 */
export default class BetterTodoPlugin extends Plugin {
  async onload() {
    // ── CodeMirror extensions for live preview / source mode ─────────────
    this.registerEditorExtension([todoDecorations]);

    // ── Custom Timeline view ─────────────────────────────────────────────
    this.registerView(
      VIEW_TYPE_BTODO_TIMELINE,
      (leaf) => new TimelineItemView(leaf)
    );

    this.addRibbonIcon("calendar-clock", "Open Better TODO Timeline", () => {
      void this.activateTimeline();
    });

    // ── Commands ─────────────────────────────────────────────────────────
    this.addCommand({
      id: "open-timeline",
      name: "Open Timeline view",
      callback: () => void this.activateTimeline(),
    });

    this.addCommand({
      id: "toggle-task-done",
      name: "Toggle task: done",
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        if (checking) return true;
        toggleTaskState(editor, "done");
      },
    });

    this.addCommand({
      id: "toggle-task-cancelled",
      name: "Toggle task: cancelled",
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        if (checking) return true;
        toggleTaskState(editor, "cancelled");
      },
    });

    this.addCommand({
      id: "archive-completed",
      name: "Archive completed tasks (move to Archive: section)",
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        if (checking) return true;
        archiveCompletedTasks(editor);
      },
    });
  }

  async onunload() {
    // Detach any open timeline panes when the plugin is disabled.
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_BTODO_TIMELINE);
  }

  /** Open (or focus) the Timeline view in the right sidebar. */
  async activateTimeline() {
    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(VIEW_TYPE_BTODO_TIMELINE);
    if (existing.length > 0) {
      await workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("Better TODO: failed to acquire a workspace leaf");
      return;
    }
    await leaf.setViewState({
      type: VIEW_TYPE_BTODO_TIMELINE,
      active: true,
    });
    await workspace.revealLeaf(leaf);
  }
}

// ─── Editor mutation helpers ──────────────────────────────────────────────

type TargetState = "done" | "cancelled";

const RE_MD_TASK = /^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX/\-])\](\s+)/;
const RE_TODO = /^(\s*)([☐✔✘])(\s+)/;

/**
 * Cycle a task line between pending and the requested state. Works on both
 * Markdown task lists and .todo glyph lines. Operates on the line under each
 * cursor / selection range so multi-cursor edits work.
 */
function toggleTaskState(editor: Editor, target: TargetState) {
  const selections = editor.listSelections();
  const seenLines = new Set<number>();
  const edits: { line: number; from: number; to: number; replacement: string }[] = [];

  for (const sel of selections) {
    const a = Math.min(sel.anchor.line, sel.head.line);
    const b = Math.max(sel.anchor.line, sel.head.line);
    for (let ln = a; ln <= b; ln++) {
      if (seenLines.has(ln)) continue;
      seenLines.add(ln);
      const text = editor.getLine(ln);

      // Markdown task
      const md = text.match(RE_MD_TASK);
      if (md) {
        const cur = md[2];
        const desiredChar =
          target === "done" ? (cur === "x" || cur === "X" ? " " : "x") :
          /* cancelled */     (cur === "-" || cur === "/" ? " " : "-");
        const newPrefix = `${md[1]}[${desiredChar}]${md[3]}`;
        edits.push({
          line: ln,
          from: 0,
          to: md[0].length,
          replacement: newPrefix,
        });
        continue;
      }

      // .todo glyphs
      const td = text.match(RE_TODO);
      if (td) {
        const cur = td[2];
        const desiredGlyph =
          target === "done" ? (cur === "✔" ? "☐" : "✔") :
          /* cancelled */     (cur === "✘" ? "☐" : "✘");
        edits.push({
          line: ln,
          from: 0,
          to: td[0].length,
          replacement: `${td[1]}${desiredGlyph}${td[3]}`,
        });
      }
    }
  }

  // Apply edits bottom-up so prior offsets remain valid.
  edits.sort((x, y) => y.line - x.line);
  for (const e of edits) {
    editor.replaceRange(
      e.replacement,
      { line: e.line, ch: e.from },
      { line: e.line, ch: e.to }
    );
  }
}

/**
 * Move every done/cancelled task into a trailing `Archive:` section. If no
 * such section exists, it's appended to the end of the document. Each
 * archived line is tagged with `@project(...)` reflecting the project
 * ancestry it was lifted from (when discoverable from the file structure).
 */
function archiveCompletedTasks(editor: Editor) {
  const content = editor.getValue();
  const lines = content.split("\n");

  let archiveIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^archives?\s*:\s*$/i.test(lines[i].trim())) {
      archiveIdx = i;
      break;
    }
  }

  const preLines = archiveIdx >= 0 ? lines.slice(0, archiveIdx) : lines.slice();
  const archiveTail = archiveIdx >= 0 ? lines.slice(archiveIdx + 1) : [];

  const projectStack: { indent: number; name: string }[] = [];
  const archived: string[] = [];
  const kept: string[] = [];

  const TASK_DONE_RE = /^(\s*)(✔|✘|(?:[-*+]|\d+\.)\s+\[[xX/\-]\])\s+(.*)$/;

  for (const raw of preLines) {
    const indentStr = raw.match(/^(\s*)/)?.[1] || "";
    const indent = indentStr.replace(/\t/g, "  ").length;
    const trimmed = raw.trim();

    const isTaskLine =
      /^[☐✔✘]/.test(trimmed) ||
      /^(?:[-*+]|\d+\.)\s+\[[ xX/\-]\]/.test(trimmed);

    const projMatch =
      !isTaskLine && trimmed.length > 1
        ? trimmed.match(/^(.+?):\s*(?:@.*)?$/)
        : null;

    if (projMatch) {
      while (projectStack.length && projectStack[projectStack.length - 1].indent >= indent) {
        projectStack.pop();
      }
      projectStack.push({ indent, name: projMatch[1].trim() });
      kept.push(raw);
      continue;
    }

    const taskMatch = raw.match(TASK_DONE_RE);
    if (taskMatch) {
      while (projectStack.length && projectStack[projectStack.length - 1].indent >= indent) {
        projectStack.pop();
      }
      const projPath = projectStack.map((p) => p.name).join(".");
      const text = taskMatch[3];
      const hasProjectTag = /@project\(/.test(text);
      const projTag = !hasProjectTag && projPath ? ` @project(${projPath})` : "";
      // Normalise to a 2-space indented Markdown done item under Archive:
      archived.push(`  - [x] ${text}${projTag}`);
      continue;
    }

    kept.push(raw);
  }

  if (archived.length === 0) {
    new Notice("Better TODO: nothing to archive");
    return;
  }

  let result: string[];
  if (archiveIdx >= 0) {
    result = [...kept, "Archive:", ...archived, ...archiveTail];
  } else {
    while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
    result = [...kept, "", "Archive:", ...archived];
  }

  editor.setValue(result.join("\n"));
  new Notice(`Better TODO: archived ${archived.length} task(s)`);
}

// `TFile` re-export avoids "unused import" if the helper above is later trimmed.
void TFile;
