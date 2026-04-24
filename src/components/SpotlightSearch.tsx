import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, X, CheckSquare, Square, XSquare, FolderOpen, FileText, ArrowRight, Terminal, Settings as SettingsIcon, LayoutGrid, Sun, FilePlus, Save, SaveAll, FolderTree } from "lucide-react";
import type { ParsedDocument, ParsedProject } from "../editor/todoParser";

export interface SpotlightCommands {
  onNewTask?: () => void;
  onOpenSettings?: () => void;
  onToggleWidget?: () => void;
  onCycleTheme?: () => void;
  onToggleExplorer?: () => void;
  onNewFile?: () => void;
  onOpenFile?: () => void;
  onSaveFile?: () => void;
  onSaveAsFile?: () => void;
}

interface SpotlightSearchProps extends SpotlightCommands {
  parsedDoc: ParsedDocument | null;
  content: string;
  onClose: () => void;
  onFocusLine: (lineIndex: number) => void;
}

type ResultCategory = "task" | "project" | "line" | "command";

interface CommandDef {
  id: string;
  label: string;
  keywords: string;
  icon: React.ReactNode;
  run: () => void;
}

interface SearchResult {
  id: string;
  category: ResultCategory;
  line: number;
  primary: string;
  secondary?: string;
  state?: string;
  tags?: string[];
  command?: CommandDef;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-editor-accent font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

function stateIcon(state?: string) {
  if (state === "pending") return <Square size={13} className="text-editor-accent shrink-0" />;
  if (state === "done") return <CheckSquare size={13} className="text-editor-green shrink-0" />;
  if (state === "cancelled") return <XSquare size={13} className="text-editor-red shrink-0" />;
  return null;
}

function categoryIcon(cat: ResultCategory) {
  if (cat === "task") return <CheckSquare size={13} className="text-editor-accent shrink-0" />;
  if (cat === "project") return <FolderOpen size={13} className="text-editor-yellow shrink-0" />;
  if (cat === "command") return <Terminal size={13} className="text-editor-mauve shrink-0" />;
  return <FileText size={13} className="text-editor-muted shrink-0" />;
}

export default function SpotlightSearch({
  parsedDoc,
  content,
  onClose,
  onFocusLine,
  onNewTask,
  onOpenSettings,
  onToggleWidget,
  onCycleTheme,
  onToggleExplorer,
  onNewFile,
  onOpenFile,
  onSaveFile,
  onSaveAsFile,
}: SpotlightSearchProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const isCommandMode = query.startsWith(">");

  // Build the list of available commands
  const commands = useMemo<CommandDef[]>(() => {
    const defs: (CommandDef | false | undefined)[] = [
      onNewTask && {
        id: "cmd-new-task",
        label: "New Task",
        keywords: "add task new todo create item",
        icon: <CheckSquare size={13} className="text-editor-accent shrink-0" />,
        run: onNewTask,
      },
      onNewFile && {
        id: "cmd-new-file",
        label: "New File",
        keywords: "new file create project document",
        icon: <FilePlus size={13} className="text-editor-accent shrink-0" />,
        run: onNewFile,
      },
      onOpenFile && {
        id: "cmd-open-file",
        label: "Open File",
        keywords: "open file load",
        icon: <FolderOpen size={13} className="text-editor-peach shrink-0" />,
        run: onOpenFile,
      },
      onSaveFile && {
        id: "cmd-save",
        label: "Save File",
        keywords: "save write persist",
        icon: <Save size={13} className="text-editor-green shrink-0" />,
        run: onSaveFile,
      },
      onSaveAsFile && {
        id: "cmd-save-as",
        label: "Save As...",
        keywords: "save as export copy",
        icon: <SaveAll size={13} className="text-editor-green shrink-0" />,
        run: onSaveAsFile,
      },
      onOpenSettings && {
        id: "cmd-settings",
        label: "Open Settings",
        keywords: "settings preferences config options",
        icon: <SettingsIcon size={13} className="text-editor-mauve shrink-0" />,
        run: onOpenSettings,
      },
      onToggleWidget && {
        id: "cmd-toggle-widget",
        label: "Toggle Widget",
        keywords: "widget sticker view toggle show hide",
        icon: <LayoutGrid size={13} className="text-editor-accent shrink-0" />,
        run: onToggleWidget,
      },
      onToggleExplorer && {
        id: "cmd-toggle-explorer",
        label: "Toggle File Explorer",
        keywords: "explorer sidebar files tree view toggle",
        icon: <FolderTree size={13} className="text-editor-accent shrink-0" />,
        run: onToggleExplorer,
      },
      onCycleTheme && {
        id: "cmd-cycle-theme",
        label: "Cycle Theme (Light / Dark / System)",
        keywords: "theme dark light system appearance switch view",
        icon: <Sun size={13} className="text-editor-yellow shrink-0" />,
        run: onCycleTheme,
      },
    ];
    return defs.filter((d): d is CommandDef => Boolean(d));
  }, [onNewTask, onOpenSettings, onToggleWidget, onCycleTheme, onToggleExplorer, onNewFile, onOpenFile, onSaveFile, onSaveAsFile]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  const lines = useMemo(() => content.split("\n"), [content]);

  const results = useMemo<SearchResult[]>(() => {
    // Command mode: when query starts with '>'
    if (isCommandMode) {
      const cq = query.slice(1).trim().toLowerCase();
      const filtered = cq
        ? commands.filter(
            (c) =>
              c.label.toLowerCase().includes(cq) ||
              c.keywords.toLowerCase().includes(cq)
          )
        : commands;
      return filtered.map((c) => ({
        id: c.id,
        category: "command" as ResultCategory,
        line: -1,
        primary: c.label,
        command: c,
      }));
    }

    const q = query.trim().toLowerCase();
    if (!q) return [];

    const out: SearchResult[] = [];
    const addedLines = new Set<number>();

    // Search tasks
    if (parsedDoc) {
      for (const task of parsedDoc.tasks) {
        if (task.text.toLowerCase().includes(q) || task.tags.some(t => t.toLowerCase().includes(q))) {
          out.push({
            id: `task-${task.line}`,
            category: "task",
            line: task.line,
            primary: task.text,
            state: task.state,
            tags: task.tags,
          });
          addedLines.add(task.line);
        }
      }

      // Search projects
      const searchProjects = (projects: ParsedProject[]) => {
        for (const proj of projects) {
          if (proj.name.toLowerCase().includes(q) || proj.tags.some(t => t.toLowerCase().includes(q))) {
            out.push({
              id: `proj-${proj.line}`,
              category: "project",
              line: proj.line,
              primary: proj.name,
              secondary: `${proj.stats.pending} pending · ${proj.stats.done} done`,
              tags: proj.tags,
            });
            addedLines.add(proj.line);
          }
          // Recurse into children that are projects
          const childProjects = proj.children.filter((c): c is ParsedProject => !("state" in c));
          if (childProjects.length) searchProjects(childProjects);
        }
      };
      searchProjects(parsedDoc.projects);
    }

    // Search raw lines (general text search like Ctrl+F)
    for (let i = 0; i < lines.length; i++) {
      if (addedLines.has(i)) continue;
      if (lines[i].toLowerCase().includes(q)) {
        out.push({
          id: `line-${i}`,
          category: "line",
          line: i,
          primary: lines[i].trim() || "(empty line)",
        });
      }
    }

    return out.slice(0, 100);
  }, [query, parsedDoc, lines, isCommandMode, commands]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (result.category === "command" && result.command) {
        result.command.run();
        onClose();
        return;
      }
      onFocusLine(result.line);
      onClose();
    },
    [onFocusLine, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results.length > 0) {
        e.preventDefault();
        const sel = results[activeIndex];
        if (sel) handleSelect(sel);
      }
    },
    [results, activeIndex, handleSelect]
  );

  // Group results by category for display
  const grouped = useMemo(() => {
    const groups: { category: ResultCategory; label: string; items: (SearchResult & { globalIdx: number })[] }[] = [];
    const map = new Map<ResultCategory, (SearchResult & { globalIdx: number })[]>();
    let idx = 0;
    for (const r of results) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push({ ...r, globalIdx: idx++ });
    }
    const order: [ResultCategory, string][] = [["command", "Commands"], ["task", "Tasks"], ["project", "Projects"], ["line", "Lines"]];
    for (const [cat, label] of order) {
      const items = map.get(cat);
      if (items?.length) groups.push({ category: cat, label, items });
    }
    return groups;
  }, [results]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Spotlight panel */}
      <div className="relative w-[560px] max-w-[90vw] rounded-xl border border-editor-border bg-editor-surface/95 backdrop-blur-2xl shadow-2xl overflow-hidden spotlight-panel">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-editor-border/60">
          <Search size={18} className="text-editor-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isCommandMode ? "Run a command..." : "Search tasks, projects, or text...  (type > for commands)"}
            className="flex-1 bg-transparent text-[14px] text-editor-text placeholder-editor-muted/60 focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="p-0.5 rounded hover:bg-editor-border/60 transition-colors"
            >
              <X size={14} className="text-editor-muted" />
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {query && results.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-editor-muted">
              No results for "{query}"
            </div>
          )}

          {!query && (
            <div className="px-4 py-8 text-center text-[13px] text-editor-muted">
              Type to search tasks, projects, and text<br />
              <span className="text-[11px] text-editor-muted/70">Press <kbd className="px-1 py-0.5 rounded bg-editor-border/60 text-editor-subtext">&gt;</kbd> to enter command mode</span>
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.category}>
              <div className="px-4 pt-3 pb-1 text-[10px] font-semibold text-editor-muted uppercase tracking-wider">
                {group.label}
                <span className="ml-1.5 text-editor-muted/60">{group.items.length}</span>
              </div>
              {group.items.map((result) => (
                <button
                  key={result.id}
                  data-index={result.globalIdx}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setActiveIndex(result.globalIdx)}
                  className={`flex items-center w-full gap-2.5 px-4 py-2 text-left transition-colors ${
                    result.globalIdx === activeIndex
                      ? "bg-editor-accent/15"
                      : "hover:bg-editor-border/30"
                  }`}
                >
                  {result.category === "command" && result.command
                    ? result.command.icon
                    : result.category === "task"
                      ? stateIcon(result.state)
                      : categoryIcon(result.category)}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-editor-text truncate">
                      {highlightMatch(result.primary, isCommandMode ? query.slice(1).trim() : query)}
                    </div>
                    {result.secondary && (
                      <div className="text-[10px] text-editor-muted truncate mt-0.5">
                        {result.secondary}
                      </div>
                    )}
                  </div>
                  {result.tags && result.tags.length > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      {result.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 text-[9px] rounded-full bg-editor-accent/10 text-editor-accent"
                        >
                          @{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {result.category !== "command" && (
                    <span className="text-[10px] text-editor-muted/50 tabular-nums shrink-0 ml-1">
                      :{result.line + 1}
                    </span>
                  )}
                  {result.globalIdx === activeIndex && (
                    <ArrowRight size={12} className="text-editor-accent shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-2 border-t border-editor-border/40 text-[10px] text-editor-muted">
            <span><kbd className="px-1 py-0.5 rounded bg-editor-border/60 text-editor-subtext">↑↓</kbd> navigate</span>
            <span><kbd className="px-1 py-0.5 rounded bg-editor-border/60 text-editor-subtext">Enter</kbd> {isCommandMode ? "run command" : "go to line"}</span>
            <span><kbd className="px-1 py-0.5 rounded bg-editor-border/60 text-editor-subtext">Esc</kbd> close</span>
          </div>
        )}
      </div>
    </div>
  );
}
