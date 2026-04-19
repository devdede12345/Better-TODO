import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  FileText,
  FolderOpen,
  Save,
  CheckSquare,
  Square,
  XSquare,
  Clock,
  FilePlus,
  SaveAll,
  Undo2,
  Redo2,
  Search,
  Replace,
  Scissors,
  Copy,
  ClipboardPaste,
  Archive,
} from "lucide-react";
import TodoEditor from "./components/TodoEditor";
import Dashboard from "./components/Dashboard";
import { type ParsedDocument, formatMinutes } from "./editor/todoParser";

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function App() {
  const [content, setContent] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [stats, setStats] = useState({ total: 0, done: 0, pending: 0, cancelled: 0, estMinutes: 0 });
  const [parsedDoc, setParsedDoc] = useState<ParsedDocument | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;
  const [stickerVisible, setStickerVisible] = useState(false);
  const sc = useCallback((win: string, mac: string) => (isMac ? mac : win), []);
  const shellBgClass = isMac ? "bg-editor-bg/70 backdrop-blur-2xl" : "bg-editor-bg";
  const chromeBgClass = isMac ? "bg-editor-surface/75 backdrop-blur-xl" : "bg-editor-surface";

  // Update stats from parser output
  const handleParsed = useCallback((parsed: ParsedDocument) => {
    setParsedDoc(parsed);
    const g = parsed.globalStats;
    setStats({ total: g.total, done: g.done, pending: g.pending, cancelled: g.cancelled, estMinutes: g.estMinutes });
  }, []);

  // Enter editor mode with content + path
  const enterEditor = useCallback(
    (fileContent: string, path: string) => {
      setContent(fileContent);
      setFilePath(path);
      setIsDirty(false);
      setIsEditing(true);
    },
    []
  );

  // Dashboard: New File
  const handleNew = useCallback(async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.newFile();
      if (result) {
        enterEditor(result.content, result.path);
      }
    } else {
      // Browser fallback: enter editor with empty content
      enterEditor("", "untitled.todo");
    }
  }, [enterEditor]);

  // Dashboard + Editor: Open File
  const handleOpen = useCallback(async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.openFile();
      if (result) {
        enterEditor(result.content, result.path);
        // If already in editor, push content to CodeMirror
        if (isEditing) {
          (window as any).__todoEditorSetContent?.(result.content);
        }
      }
    }
  }, [enterEditor, isEditing]);

  const handleChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      setIsDirty(true);

      // Sync content to sticker window
      const fn = (filePathRef.current || "Untitled").split(/[\\/]/).pop() || "Untitled";
      window.electronAPI?.stickerSyncContent?.(newContent, fn);

      // Auto-save after 2 seconds of inactivity
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        if (window.electronAPI) {
          await window.electronAPI.saveFile(newContent);
          setIsDirty(false);
        }
      }, 2000);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!window.electronAPI) return;
    const path = await window.electronAPI.saveFile(content);
    if (path) {
      setFilePath(path);
      setIsDirty(false);
    }
  }, [content]);

  const handleSaveAs = useCallback(async () => {
    if (!window.electronAPI) return;
    const path = await window.electronAPI.saveFileAs(content);
    if (path) {
      setFilePath(path);
      setIsDirty(false);
    }
  }, [content]);

  // Sticker toggle
  const handleStickerToggle = useCallback(async () => {
    if (!window.electronAPI) return;
    const visible = await window.electronAPI.stickerToggle();
    setStickerVisible(visible);
    // If just opened, sync current content
    if (visible) {
      const fn = (filePath || "Untitled").split(/[\\/]/).pop() || "Untitled";
      window.electronAPI.stickerSyncContent(content, fn);
    }
  }, [content, filePath]);

  // Listen for sticker visibility changes (e.g. closed from sticker itself)
  useEffect(() => {
    if (!window.electronAPI?.onStickerVisibility) return;
    const cleanup = window.electronAPI.onStickerVisibility((visible) => {
      setStickerVisible(visible);
    });
    return cleanup;
  }, []);

  // Check initial sticker state
  useEffect(() => {
    window.electronAPI?.stickerIsVisible?.().then((v) => setStickerVisible(v));
  }, []);

  useEffect(() => {
    if (!isMac) return;
    document.documentElement.classList.add("macos-vibrancy");
    document.body.classList.add("macos-vibrancy");
    return () => {
      document.documentElement.classList.remove("macos-vibrancy");
      document.body.classList.remove("macos-vibrancy");
    };
  }, []);

  // Listen for tasks appended via Quick Entry
  useEffect(() => {
    if (!window.electronAPI?.onTaskAppended) return;
    const cleanup = window.electronAPI.onTaskAppended((newContent) => {
      setContent(newContent);
      (window as any).__todoEditorSetContent?.(newContent);
    });
    return cleanup;
  }, []);

  // Keyboard shortcuts (only active when editing)
  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "s" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (mod && e.shiftKey && key === "s") {
        e.preventDefault();
        handleSaveAs();
      } else if (mod && key === "o") {
        e.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing, handleSave, handleSaveAs, handleOpen]);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  // Execute a menu action and close the menu
  const menuAction = useCallback((fn: () => void) => {
    setOpenMenu(null);
    fn();
  }, []);

  // Dispatch a CodeMirror command via a synthetic keyboard event
  const dispatchEditorKey = useCallback((key: string, mod = false, shift = false, alt = false) => {
    const editor = document.querySelector(".cm-editor .cm-content") as HTMLElement | null;
    if (!editor) return;
    editor.focus();
    const keyCode = key.length === 1 ? `Key${key.toUpperCase()}` : key;
    const event = new KeyboardEvent("keydown", {
      key,
      code: keyCode,
      ctrlKey: mod && !isMac,
      metaKey: mod && isMac,
      shiftKey: shift,
      altKey: alt,
      bubbles: true,
    });
    editor.dispatchEvent(event);
  }, []);

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : "Untitled";

  // ── Dashboard View ──
  if (!isEditing) {
    return (
      <div className={`flex flex-col h-screen ${shellBgClass}`}>
        {/* Title Bar (minimal, for window drag) */}
        <div className={`titlebar-drag flex items-center h-9 border-b border-editor-border px-4 select-none shrink-0 ${chromeBgClass}`}>
          <div className="flex items-center gap-2 titlebar-no-drag">
            <FileText size={14} className="text-editor-accent" />
            <span className="text-xs font-medium text-editor-text">
              Better TODO
            </span>
          </div>
        </div>

        {/* Dashboard */}
        <div className="flex-1">
          <Dashboard onNew={handleNew} onOpen={handleOpen} />
        </div>
      </div>
    );
  }

  // ── Editor View ──
  return (
    <div className={`flex flex-col h-screen ${shellBgClass}`}>
      {/* Title Bar */}
      <div className={`titlebar-drag flex items-center h-9 border-b border-editor-border px-4 select-none shrink-0 ${chromeBgClass}`}>
        <div className="flex items-center gap-2 titlebar-no-drag">
          <FileText size={14} className="text-editor-accent" />
          <span className="text-xs font-medium text-editor-text">
            Better TODO
          </span>
          <span className="text-xs text-editor-muted mx-1">|</span>
          <span className="text-xs text-editor-subtext">
            {fileName}
            {isDirty && <span className="text-editor-yellow ml-1">●</span>}
          </span>
        </div>

        {/* ── Menu Bar ── */}
        <div ref={menuBarRef} className="flex items-center ml-4 titlebar-no-drag relative">
          {/* File Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === "file" ? null : "file")}
              onMouseEnter={() => openMenu && setOpenMenu("file")}
              className={`px-2.5 py-1 text-[12px] rounded transition-colors ${
                openMenu === "file" ? "bg-editor-border text-editor-text" : "text-editor-subtext hover:text-editor-text hover:bg-editor-border/50"
              }`}
            >
              File
            </button>
            {openMenu === "file" && (
              <div className="absolute top-full left-0 mt-0.5 w-56 bg-editor-surface border border-editor-border rounded-md shadow-xl z-50 py-1">
                <MenuItem icon={<FilePlus size={14} />} label="New File" shortcut={sc("Ctrl+N", "⌘+N")} onClick={() => menuAction(handleNew)} />
                <MenuItem icon={<FolderOpen size={14} />} label="Open File" shortcut={sc("Ctrl+O", "⌘+O")} onClick={() => menuAction(handleOpen)} />
                <MenuDivider />
                <MenuItem icon={<Save size={14} />} label="Save" shortcut={sc("Ctrl+S", "⌘+S")} onClick={() => menuAction(handleSave)} />
                <MenuItem icon={<SaveAll size={14} />} label="Save As..." shortcut={sc("Ctrl+Shift+S", "⌘+Shift+S")} onClick={() => menuAction(handleSaveAs)} />
              </div>
            )}
          </div>

          {/* Edit Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === "edit" ? null : "edit")}
              onMouseEnter={() => openMenu && setOpenMenu("edit")}
              className={`px-2.5 py-1 text-[12px] rounded transition-colors ${
                openMenu === "edit" ? "bg-editor-border text-editor-text" : "text-editor-subtext hover:text-editor-text hover:bg-editor-border/50"
              }`}
            >
              Edit
            </button>
            {openMenu === "edit" && (
              <div className="absolute top-full left-0 mt-0.5 w-56 bg-editor-surface border border-editor-border rounded-md shadow-xl z-50 py-1">
                <MenuItem icon={<Undo2 size={14} />} label="Undo" shortcut={sc("Ctrl+Z", "⌘+Z")} onClick={() => menuAction(() => dispatchEditorKey("z", true))} />
                <MenuItem icon={<Redo2 size={14} />} label="Redo" shortcut={sc("Ctrl+Shift+Z", "⌘+Shift+Z")} onClick={() => menuAction(() => dispatchEditorKey("z", true, true))} />
                <MenuDivider />
                <MenuItem icon={<Scissors size={14} />} label="Cut" shortcut={sc("Ctrl+X", "⌘+X")} onClick={() => menuAction(() => document.execCommand("cut"))} />
                <MenuItem icon={<Copy size={14} />} label="Copy" shortcut={sc("Ctrl+C", "⌘+C")} onClick={() => menuAction(() => document.execCommand("copy"))} />
                <MenuItem icon={<ClipboardPaste size={14} />} label="Paste" shortcut={sc("Ctrl+V", "⌘+V")} onClick={() => menuAction(() => document.execCommand("paste"))} />
                <MenuDivider />
                <MenuItem icon={<Search size={14} />} label="Find" shortcut={sc("Ctrl+F", "⌘+F")} onClick={() => menuAction(() => dispatchEditorKey("f", true))} />
                <MenuItem icon={<Replace size={14} />} label="Replace" shortcut={sc("Ctrl+H", "⌘+H")} onClick={() => menuAction(() => dispatchEditorKey("h", true))} />
              </div>
            )}
          </div>

          {/* Tasks Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === "tasks" ? null : "tasks")}
              onMouseEnter={() => openMenu && setOpenMenu("tasks")}
              className={`px-2.5 py-1 text-[12px] rounded transition-colors ${
                openMenu === "tasks" ? "bg-editor-border text-editor-text" : "text-editor-subtext hover:text-editor-text hover:bg-editor-border/50"
              }`}
            >
              Tasks
            </button>
            {openMenu === "tasks" && (
              <div className="absolute top-full left-0 mt-0.5 w-56 bg-editor-surface border border-editor-border rounded-md shadow-xl z-50 py-1">
                <MenuItem icon={<CheckSquare size={14} />} label="New Task" shortcut={sc("Ctrl+Enter", "⌘+Enter")} onClick={() => menuAction(() => dispatchEditorKey("Enter", true))} />
                <MenuItem icon={<CheckSquare size={14} />} label="Toggle Done" shortcut={sc("Ctrl+D", "⌘+D")} onClick={() => menuAction(() => dispatchEditorKey("d", true))} />
                <MenuItem icon={<XSquare size={14} />} label="Toggle Cancelled" shortcut="Alt+C" onClick={() => menuAction(() => dispatchEditorKey("c", false, false, true))} />
                <MenuDivider />
                <MenuItem icon={<Archive size={14} />} label="Archive Done" shortcut={sc("Ctrl+Shift+A", "⌘+Shift+A")} onClick={() => menuAction(() => dispatchEditorKey("a", true, true))} />
              </div>
            )}
          </div>

          {/* Format Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === "format" ? null : "format")}
              onMouseEnter={() => openMenu && setOpenMenu("format")}
              className={`px-2.5 py-1 text-[12px] rounded transition-colors ${
                openMenu === "format" ? "bg-editor-border text-editor-text" : "text-editor-subtext hover:text-editor-text hover:bg-editor-border/50"
              }`}
            >
              Format
            </button>
            {openMenu === "format" && (
              <div className="absolute top-full left-0 mt-0.5 w-56 bg-editor-surface border border-editor-border rounded-md shadow-xl z-50 py-1">
                <MenuItem label="Bold" shortcut={sc("Ctrl+B", "⌘+B")} onClick={() => menuAction(() => dispatchEditorKey("b", true))} />
                <MenuItem label="Italic" shortcut={sc("Ctrl+I", "⌘+I")} onClick={() => menuAction(() => dispatchEditorKey("i", true))} />
                <MenuItem label="Underline" shortcut={sc("Ctrl+U", "⌘+U")} onClick={() => menuAction(() => dispatchEditorKey("u", true))} />
              </div>
            )}
          </div>

          {/* Sticker Toggle */}
          <button
            onClick={handleStickerToggle}
            className={`px-2.5 py-1 text-[12px] rounded transition-colors ${
              stickerVisible ? "bg-editor-accent/20 text-editor-accent" : "text-editor-subtext hover:text-editor-text hover:bg-editor-border/50"
            }`}
            title={stickerVisible ? "Hide Sticker" : "Show Sticker"}
          >
            Sticker
          </button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1 titlebar-no-drag">
          <button
            onClick={handleOpen}
            className="p-1.5 rounded hover:bg-editor-border transition-colors"
            title={`Open File (${sc("Ctrl+O", "⌘+O")})`}
          >
            <FolderOpen size={14} className="text-editor-subtext" />
          </button>
          <button
            onClick={handleSave}
            className="p-1.5 rounded hover:bg-editor-border transition-colors"
            title={`Save (${sc("Ctrl+S", "⌘+S")})`}
          >
            <Save size={14} className="text-editor-subtext" />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <TodoEditor initialContent={content} onChange={handleChange} onParsed={handleParsed} />
      </div>

      {/* Status Bar */}
      <div className={`flex items-center h-6 border-t border-editor-border px-4 select-none shrink-0 ${chromeBgClass}`}>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1 text-editor-subtext">
            <CheckSquare size={11} />
            {stats.total} tasks
          </span>
          <span className="flex items-center gap-1 text-editor-accent">
            <Square size={11} />
            {stats.pending} pending
          </span>
          <span className="flex items-center gap-1 text-editor-green">
            <CheckSquare size={11} />
            {stats.done} done
          </span>
          <span className="flex items-center gap-1 text-editor-red">
            <XSquare size={11} />
            {stats.cancelled} cancelled
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[11px] text-editor-muted">
          {stats.estMinutes > 0 && (
            <span className="flex items-center gap-1 text-editor-yellow">
              <Clock size={11} />
              {formatMinutes(stats.estMinutes)} est
            </span>
          )}
          <span>{sc("Ctrl+D", "⌘+D")} done</span>
          <span>Alt+C cancel</span>
          <span>{sc("Ctrl+Enter", "⌘+Enter")} new</span>
          <span>{sc("Ctrl+B", "⌘+B")} bold</span>
          <span>{sc("Ctrl+I", "⌘+I")} italic</span>
          <span>{sc("Ctrl+U", "⌘+U")} underline</span>
          <span>{sc("Ctrl+Shift+A", "⌘+Shift+A")} archive</span>
        </div>
      </div>
    </div>
  );
}

// ─── Menu helper components ──────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center w-full px-3 py-1.5 text-[12px] text-editor-subtext hover:text-editor-text hover:bg-editor-border/60 transition-colors gap-2.5"
    >
      <span className="w-4 flex-shrink-0 flex items-center justify-center text-editor-muted">
        {icon || null}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-[11px] text-editor-muted ml-auto">{shortcut}</span>
      )}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-editor-border" />;
}

export default App;
