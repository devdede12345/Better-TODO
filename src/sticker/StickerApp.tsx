import { useState, useEffect, useCallback, useRef } from "react";
import { Lock, Unlock, X, GripVertical, FolderOpen, RefreshCw, Undo2 } from "lucide-react";

interface StickerTask {
  text: string;
  state: "pending" | "done" | "cancelled";
  indent: number;
}

interface StickerProject {
  name: string;
}

type StickerLine = { type: "task"; data: StickerTask } | { type: "project"; data: StickerProject };

function parseStickerContent(content: string): StickerLine[] {
  const lines: StickerLine[] = [];
  for (const raw of content.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Project: ends with ':'
    if (/^[^\s☐✔✘].+:(\s*\(.*\))?$/.test(trimmed) && !trimmed.startsWith("-") && !trimmed.startsWith("*")) {
      const name = trimmed.replace(/:\s*\(.*\)$/, ":").trim();
      // Skip "Archive:" section
      if (name === "Archive:") break;
      lines.push({ type: "project", data: { name } });
      continue;
    }

    // Tasks
    const indent = raw.search(/\S/);
    if (trimmed.startsWith("☐")) {
      lines.push({ type: "task", data: { text: trimmed.slice(1).trim(), state: "pending", indent } });
    } else if (trimmed.startsWith("✔")) {
      lines.push({ type: "task", data: { text: trimmed.slice(1).trim(), state: "done", indent } });
    } else if (trimmed.startsWith("✘")) {
      lines.push({ type: "task", data: { text: trimmed.slice(1).trim(), state: "cancelled", indent } });
    }
  }
  return lines;
}

export default function StickerApp() {
  const [lines, setLines] = useState<StickerLine[]>([]);
  const [locked, setLocked] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [fileName, setFileName] = useState<string>("No file");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Apply parsed content
  const applyContent = useCallback((content: string, name?: string) => {
    if (name) setFileName(name);
    const parsed = parseStickerContent(content);
    setLines(parsed);
    setPendingCount(parsed.filter((l) => l.type === "task" && l.data.state === "pending").length);
  }, []);

  // Self-load: request current content on startup
  useEffect(() => {
    window.electronAPI?.stickerRequestContent?.().then((result) => {
      if (result) applyContent(result.content, result.fileName);
    });
  }, [applyContent]);

  // Listen for content updates from main window
  useEffect(() => {
    if (!window.electronAPI?.onStickerUpdate) return;
    const cleanup = window.electronAPI.onStickerUpdate((content, name) => {
      applyContent(content, name);
    });
    return cleanup;
  }, [applyContent]);

  // Listen for lock state changes
  useEffect(() => {
    if (!window.electronAPI?.onStickerLockState) return;
    const cleanup = window.electronAPI.onStickerLockState((l) => setLocked(l));
    return cleanup;
  }, []);

  // Get initial lock state
  useEffect(() => {
    window.electronAPI?.stickerGetLocked?.().then((l) => setLocked(l));
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = (dark: boolean) => {
      const next = dark ? "theme-dark" : "theme-light";
      const prev = dark ? "theme-light" : "theme-dark";
      document.documentElement.classList.remove(prev);
      document.body.classList.remove(prev);
      document.documentElement.classList.add(next);
      document.body.classList.add(next);
    };

    applyTheme(media.matches);

    const onChange = (e: MediaQueryListEvent) => applyTheme(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleToggleLock = useCallback(async () => {
    if (!window.electronAPI) return;
    const newLocked = await window.electronAPI.stickerSetLocked(!locked);
    setLocked(newLocked);
  }, [locked]);

  const handleClose = useCallback(() => {
    window.electronAPI?.stickerToggle();
  }, []);

  const handleOpenFile = useCallback(async () => {
    setMenuOpen(false);
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openFile();
    if (result) {
      applyContent(result.content, result.path.split(/[\\/]/).pop() || "Untitled");
    }
  }, [applyContent]);

  const handleReload = useCallback(async () => {
    setMenuOpen(false);
    if (!window.electronAPI) return;
    const result = await window.electronAPI.stickerRequestContent();
    if (result) applyContent(result.content, result.fileName);
  }, [applyContent]);

  const handleBack = useCallback(() => {
    window.electronAPI?.stickerBack();
  }, []);

  // Strip tag annotations for cleaner display
  const cleanText = (text: string) => {
    return text
      .replace(/@done\([^)]*\)/g, "")
      .replace(/@cancelled\([^)]*\)/g, "")
      .replace(/@started\([^)]*\)/g, "")
      .replace(/@lasted\([^)]*\)/g, "")
      .replace(/@est\([^)]*\)/g, "")
      .replace(/@due\([^)]*\)/g, "")
      .replace(/@\d+[hm]\d*[hm]?/g, "")
      .trim();
  };

  const stateColor = (state: string) => {
    switch (state) {
      case "done": return "#a6e3a1";
      case "cancelled": return "#f38ba8";
      default: return "#89b4fa";
    }
  };

  const markerChar = (state: string) => {
    switch (state) {
      case "done": return "✔";
      case "cancelled": return "✘";
      default: return "☐";
    }
  };

  return (
    <div className={`sticker-root ${locked ? "locked" : ""}`}>
      {/* Header / drag handle */}
      <div className="sticker-handle flex items-center justify-between px-3 py-2 border-b sticker-border">
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical size={12} className="sticker-icon-muted flex-shrink-0" />
          <span className="sticker-title text-[11px] font-semibold truncate" title={fileName}>
            {fileName}
          </span>
          {pendingCount > 0 && (
            <span className="sticker-badge text-[10px] px-1.5 rounded-full flex-shrink-0">
              {pendingCount}
            </span>
          )}

          {/* File menu (inline) */}
          <div className="relative flex-shrink-0 sticker-handle-nodrag ml-1" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                menuOpen ? "sticker-menu-button-active" : "sticker-menu-button"
              }`}
            >
              File
            </button>
            {menuOpen && (
              <div className="absolute top-full left-0 mt-0.5 w-44 sticker-menu-panel rounded-md shadow-xl z-50 py-1">
                <button
                  onClick={handleOpenFile}
                  className="sticker-menu-item flex items-center w-full px-3 py-1.5 text-[11px] transition-colors gap-2"
                >
                  <FolderOpen size={12} />
                  <span>Open File</span>
                </button>
                <button
                  onClick={handleReload}
                  className="sticker-menu-item flex items-center w-full px-3 py-1.5 text-[11px] transition-colors gap-2"
                >
                  <RefreshCw size={12} />
                  <span>Reload</span>
                </button>
              </div>
            )}
          </div>

          {/* Back to editor */}
          <button
            onClick={handleBack}
            className="flex-shrink-0 sticker-handle-nodrag px-1.5 py-0.5 text-[10px] rounded sticker-menu-button transition-colors"
            title="Back to editor"
          >
            Back
          </button>
        </div>

        <div className="flex items-center gap-1 sticker-handle-nodrag flex-shrink-0">
          <button
            onClick={handleToggleLock}
            className="p-1 rounded sticker-icon-button transition-colors"
            title={locked ? "Unlock (allow interaction)" : "Lock (click-through)"}
          >
            {locked ? (
              <Lock size={12} className="text-yellow-400" />
            ) : (
              <Unlock size={12} className="sticker-icon-muted" />
            )}
          </button>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-red-500/30 transition-colors"
            title="Close sticker"
          >
            <X size={12} className="sticker-icon-muted" />
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="sticker-body flex-1 overflow-y-auto px-3 py-2">
        {lines.length === 0 && (
          <div className="text-[11px] sticker-empty text-center py-8">
            No tasks loaded
          </div>
        )}
        {lines.map((line, i) => {
          if (line.type === "project") {
            return (
              <div key={i} className="sticker-project">
                {line.data.name}
              </div>
            );
          }
          const task = line.data;
          return (
            <div
              key={i}
              className={`sticker-task ${task.state}`}
              style={{ paddingLeft: Math.min(task.indent, 6) * 8 }}
            >
              <span
                className="sticker-marker"
                style={{ color: stateColor(task.state) }}
              >
                {markerChar(task.state)}
              </span>
              <span className="sticker-task-text">{cleanText(task.text)}</span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t sticker-border text-[10px] sticker-footer">
        <span>{pendingCount} pending</span>
        {locked && <span className="text-yellow-400/60">Locked</span>}
      </div>
    </div>
  );
}
