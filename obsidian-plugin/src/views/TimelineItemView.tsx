import { ItemView, WorkspaceLeaf, TFile, MarkdownView } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { StrictMode, createElement } from "react";
import Timeline from "../components/Timeline";
import { parseTodoDocument, ParsedDocument } from "../parser";

export const VIEW_TYPE_BTODO_TIMELINE = "btodo-timeline-view";

interface TimelineState {
  /** Path of the file the timeline is bound to (vault-relative). */
  filePath: string | null;
}

/**
 * Custom Obsidian view that renders the React `<Timeline />` component for
 * the active TODO/Markdown file. The view re-parses the file whenever it
 * changes on disk or when the user focuses a different file.
 */
export class TimelineItemView extends ItemView {
  private root: Root | null = null;
  private filePath: string | null = null;
  private content: string = "";
  private parsed: ParsedDocument | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.navigation = false;
  }

  getViewType(): string {
    return VIEW_TYPE_BTODO_TIMELINE;
  }

  getDisplayText(): string {
    if (!this.filePath) return "Better TODO Timeline";
    const name = this.filePath.split(/[\\/]/).pop() || this.filePath;
    return `Timeline · ${name}`;
  }

  getIcon(): string {
    return "calendar-clock";
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("btodo-root");

    const host = container.createDiv({ cls: "btodo-timeline-host" });
    host.style.height = "100%";
    host.style.width = "100%";

    this.root = createRoot(host);

    // Bind to the currently active markdown/.todo file by default.
    const active = this.app.workspace.getActiveFile();
    if (active) await this.setFile(active);
    else this.render();

    // Re-render when the bound file changes on disk.
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file instanceof TFile && file.path === this.filePath) {
          this.content = await this.app.vault.read(file);
          this.parsed = parseTodoDocument(this.content);
          this.render();
        }
      })
    );

    // Track the active markdown file so the timeline follows the user.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const file = view?.file;
        if (file && file.path !== this.filePath) {
          await this.setFile(file);
        }
      })
    );
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
  }

  async setFile(file: TFile) {
    this.filePath = file.path;
    this.content = await this.app.vault.read(file);
    this.parsed = parseTodoDocument(this.content);
    this.render();
  }

  private focusLine = (lineIndex: number) => {
    if (!this.filePath) return;
    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) return;
    // Open the file in a new (or existing) markdown editor and jump to line.
    this.app.workspace.openLinkText(this.filePath, "", false).then(() => {
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!md) return;
      const editor = md.editor;
      const safeLine = Math.max(0, Math.min(editor.lineCount() - 1, Math.floor(lineIndex)));
      const lineText = editor.getLine(safeLine);
      editor.setSelection({ line: safeLine, ch: 0 }, { line: safeLine, ch: lineText.length });
      // @ts-ignore — `scrollIntoView` is exposed on Obsidian's Editor at runtime.
      editor.scrollIntoView({ from: { line: safeLine, ch: 0 }, to: { line: safeLine, ch: 0 } }, true);
    });
  };

  private render() {
    if (!this.root) return;
    this.root.render(
      createElement(
        StrictMode,
        null,
        createElement(Timeline, {
          parsedDoc: this.parsed,
          content: this.content,
          onClose: () => this.leaf.detach(),
          onFocusLine: this.focusLine,
        })
      )
    );
  }
}

export type { TimelineState };
