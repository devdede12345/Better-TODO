import { Plugin, MarkdownView, Editor, Notice, TFile } from "obsidian";
import { EditorView } from "@codemirror/view";
import { todoDecorations } from "./editor/decorations";
import { todoKeymap, todoClickToggle, todoActions } from "./editor/keymap";
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
    this.registerEditorExtension([todoDecorations, todoKeymap, todoClickToggle]);

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
      id: "new-task",
      name: "New task (Markdown checkbox / .todo)",
      hotkeys: [{ modifiers: ["Mod"], key: "Enter" }],
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        if (checking) return true;
        runOnCM(editor, todoActions.newTask);
      },
    });

    this.addCommand({
      id: "toggle-task-done",
      name: "Toggle task: pending → done → cancelled",
      hotkeys: [{ modifiers: ["Mod"], key: "d" }],
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        if (checking) return true;
        runOnCM(editor, todoActions.toggleDone);
      },
    });

    this.addCommand({
      id: "toggle-task-cancelled",
      name: "Toggle task: cancelled",
      hotkeys: [{ modifiers: ["Alt"], key: "c" }],
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        if (checking) return true;
        runOnCM(editor, todoActions.toggleCancelled);
      },
    });

    this.addCommand({
      id: "toggle-task-started",
      name: "Toggle task: @started timestamp",
      hotkeys: [{ modifiers: ["Alt"], key: "s" }],
      editorCheckCallback: (checking, editor, view) => {
        if (!(view instanceof MarkdownView)) return false;
        if (checking) return true;
        runOnCM(editor, todoActions.toggleStarted);
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

// ─── Editor bridge ────────────────────────────────────────────────────────

/**
 * Bridge an Obsidian `Editor` to the underlying CodeMirror 6 `EditorView` so
 * command-palette entries can reuse the exact same task-mutation logic as
 * the keymap. Obsidian exposes the CM6 view as `editor.cm` at runtime; we
 * fall back to a no-op if the cast is unavailable.
 */
function runOnCM(editor: Editor, action: (view: EditorView) => boolean) {
  const cm = (editor as unknown as { cm?: EditorView }).cm;
  if (!cm) {
    new Notice("Better TODO: this command requires the live preview / source editor");
    return;
  }
  action(cm);
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
