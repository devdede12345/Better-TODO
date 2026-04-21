import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import {
  FileText,
  FolderOpen,
  Save,
  Plus,
  Sun,
  Moon,
  Monitor,
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
  LayoutGrid,
} from "lucide-react";
import TodoEditor from "./components/TodoEditor";
import Dashboard from "./components/Dashboard";
import SettingsPanel from "./components/SettingsPanel";
import FileExplorer from "./components/FileExplorer";
import { useEditorSettings, normalizeFontFamily } from "./hooks/useEditorSettings";
import { type ParsedDocument, formatMinutes } from "./editor/todoParser";

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

interface ReminderPreview {
  id: string;
  projectName: string;
  taskText: string;
  remainingSeconds: number;
  dueAt: number;
  isOverdue: boolean;
}

type NativeMenuAction =
  | "file:new"
  | "file:open"
  | "file:save"
  | "file:saveAs"
  | "task:new"
  | "task:toggleDone"
  | "task:toggleCancelled"
  | "task:archive"
  | "edit:find"
  | "edit:replace"
  | "format:bold"
  | "format:italic"
  | "format:underline"
  | "view:sticker"
  | "view:widget"
  | "view:themeCycle";

function App() {
  const { settings: editorSettings, updateSettings, resetSettings } = useEditorSettings();
  const appFontFamily = normalizeFontFamily(editorSettings.fontFamily);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [content, setContent] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [stats, setStats] = useState({ total: 0, done: 0, pending: 0, cancelled: 0, estMinutes: 0 });
  const [parsedDoc, setParsedDoc] = useState<ParsedDocument | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reminderSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;
  const [widgetVisible, setWidgetVisible] = useState(false);
  const [nextReminder, setNextReminder] = useState<ReminderPreview | null>(null);
  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">(() => {
    const saved = localStorage.getItem("theme-mode");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
  const [showExplorer, setShowExplorer] = useState<boolean>(() => localStorage.getItem("explorer-visible") !== "0");
  const [taskFilterOpen, setTaskFilterOpen] = useState(false);
  const [taskFilterKeyword, setTaskFilterKeyword] = useState("");
  const [taskFilterTag, setTaskFilterTag] = useState<string>("all");
  const taskFilterRef = useRef<HTMLDivElement>(null);
  const sc = useCallback((win: string, mac: string) => (isMac ? mac : win), []);
  const shellBgClass = isMac
    ? resolvedTheme === "light"
      ? "bg-white/70 backdrop-blur-3xl"
      : "bg-editor-bg/60 backdrop-blur-3xl"
    : resolvedTheme === "light"
      ? "bg-[#f5f7fb]"
      : "bg-editor-bg";
  const chromeBgClass = isMac
    ? resolvedTheme === "light"
      ? "bg-white/75 backdrop-blur-2xl"
      : "bg-editor-surface/70 backdrop-blur-2xl"
    : resolvedTheme === "light"
      ? "bg-[#eef2ff]"
      : "bg-editor-surface";
  const topBarHeightClass = isMac ? "h-11" : "h-9";
  const menuPanelClass = resolvedTheme === "light"
    ? "bg-white/95 backdrop-blur-2xl border-slate-300/80"
    : isMac
      ? "bg-editor-surface/75 backdrop-blur-2xl border-editor-border/80"
      : "bg-editor-surface border-editor-border";

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

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (reminderSyncTimerRef.current) clearTimeout(reminderSyncTimerRef.current);
    };
  }, []);

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

  // Open a recent file by path
  const handleOpenRecent = useCallback(async (filePath: string) => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.explorerOpenFileByPath(filePath);
    if (result) {
      enterEditor(result.content, result.path);
      if (isEditing) {
        (window as any).__todoEditorSetContent?.(result.content);
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

      // Sync draft reminders without waiting for save/newline
      if (reminderSyncTimerRef.current) clearTimeout(reminderSyncTimerRef.current);
      reminderSyncTimerRef.current = setTimeout(() => {
        window.electronAPI?.reminderSyncDraft?.(newContent);
      }, 120);

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

  const handleWidgetToggle = useCallback(async () => {
    if (!window.electronAPI?.widgetToggle) return;
    const visible = await window.electronAPI.widgetToggle();
    setWidgetVisible(visible);
    if (visible) {
      const fn = (filePath || "Untitled").split(/[\\/]/).pop() || "Untitled";
      window.electronAPI.stickerSyncContent(content, fn);
    }
  }, [content, filePath]);

  useEffect(() => {
    if (!window.electronAPI?.onWidgetVisibility) return;
    const cleanup = window.electronAPI.onWidgetVisibility((visible) => {
      setWidgetVisible(visible);
    });
    return cleanup;
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (!window.electronAPI?.getNextReminder) return;
      const reminder = await window.electronAPI.getNextReminder();
      if (alive) setNextReminder(reminder);
    };

    const startPolling = () => {
      if (timer) return;
      tick();
      timer = setInterval(tick, 1000);
    };

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) stopPolling();
      else startPolling();
    };

    // Start only if visible
    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      alive = false;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    window.electronAPI?.widgetIsVisible?.().then((v) => setWidgetVisible(v));
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

  useEffect(() => {
    localStorage.setItem("theme-mode", themeMode);
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem("explorer-visible", showExplorer ? "1" : "0");
  }, [showExplorer]);

  useEffect(() => {
    document.documentElement.style.setProperty("--app-font-family", appFontFamily);
    document.body.style.setProperty("--app-font-family", appFontFamily);
  }, [appFontFamily]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const dark = themeMode === "system" ? media.matches : themeMode === "dark";
      const next = dark ? "theme-dark" : "theme-light";
      const prev = dark ? "theme-light" : "theme-dark";
      document.documentElement.classList.remove(prev);
      document.body.classList.remove(prev);
      document.documentElement.classList.add(next);
      document.body.classList.add(next);
      setResolvedTheme(dark ? "dark" : "light");

      // Sync Windows title bar overlay colors with theme
      if (!isMac && window.electronAPI?.setTitleBarOverlay) {
        const color = dark ? "#1e1e2e" : "#eef2ff";
        const symbolColor = dark ? "#cdd6f4" : "#1f2937";
        window.electronAPI.setTitleBarOverlay(color, symbolColor);
      }
    };

    applyTheme();

    const onChange = () => applyTheme();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [themeMode]);

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
      } else if (mod && key === "/") {
        e.preventDefault();
        setShowExplorer((prev) => !prev);
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

  useEffect(() => {
    if (!taskFilterOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (taskFilterRef.current && !taskFilterRef.current.contains(event.target as Node)) {
        setTaskFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [taskFilterOpen]);

  // Execute a menu action and close the menu
  const menuAction = useCallback((fn: () => void) => {
    setOpenMenu(null);
    fn();
  }, []);

  const createNewTask = useCallback(() => {
    (window as any).__todoEditorCreateNewTask?.();
  }, []);

  const handleExplorerOpenFile = useCallback((path: string, fileContent: string) => {
    setFilePath(path);
    setContent(fileContent);
    setIsDirty(false);
    setIsEditing(true);
    (window as any).__todoEditorSetContent?.(fileContent);
  }, []);

  const availableTaskTags = useMemo(() => {
    if (!parsedDoc) return [] as string[];
    return Array.from(new Set(parsedDoc.tasks.flatMap((task) => task.tags))).sort((a, b) => a.localeCompare(b));
  }, [parsedDoc]);

  const filteredTasks = useMemo(() => {
    if (!parsedDoc) return [];
    const keyword = taskFilterKeyword.trim().toLowerCase();
    return parsedDoc.tasks.filter((task) => {
      const keywordMatch = !keyword || task.text.toLowerCase().includes(keyword);
      const tagMatch = taskFilterTag === "all" || task.tags.includes(taskFilterTag);
      return keywordMatch && tagMatch;
    });
  }, [parsedDoc, taskFilterKeyword, taskFilterTag]);

  const focusTaskLine = useCallback((lineIndex: number) => {
    (window as any).__todoEditorFocusLine?.(lineIndex + 1);
    setTaskFilterOpen(false);
  }, []);

  const cycleThemeMode = useCallback(() => {
    setThemeMode((prev) => (prev === "system" ? "light" : prev === "light" ? "dark" : "system"));
  }, []);

  const formatCountdown = useCallback((totalSeconds: number) => {
    const safe = Math.max(0, totalSeconds);
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, []);

  const formatDueAt = useCallback((ts: number) => {
    const d = new Date(ts);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${mo}/${day} ${h}:${m}`;
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

  useEffect(() => {
    if (!window.electronAPI?.onNativeMenuAction) return;
    const cleanup = window.electronAPI.onNativeMenuAction((action) => {
      switch (action as NativeMenuAction) {
        case "file:new":
          void handleNew();
          break;
        case "file:open":
          void handleOpen();
          break;
        case "file:save":
          void handleSave();
          break;
        case "file:saveAs":
          void handleSaveAs();
          break;
        case "task:new":
          createNewTask();
          break;
        case "task:toggleDone":
          dispatchEditorKey("d", true);
          break;
        case "task:toggleCancelled":
          dispatchEditorKey("c", false, false, true);
          break;
        case "task:archive":
          dispatchEditorKey("a", true, true);
          break;
        case "edit:find":
          dispatchEditorKey("f", true);
          break;
        case "edit:replace":
          dispatchEditorKey("h", true);
          break;
        case "format:bold":
          dispatchEditorKey("b", true);
          break;
        case "format:italic":
          dispatchEditorKey("i", true);
          break;
        case "format:underline":
          dispatchEditorKey("u", true);
          break;
        case "view:sticker":
          void handleWidgetToggle();
          break;
        case "view:widget":
          void handleWidgetToggle();
          break;
        case "view:themeCycle":
          cycleThemeMode();
          break;
      }
    });
    return cleanup;
  }, [
    handleNew,
    handleOpen,
    handleSave,
    handleSaveAs,
    createNewTask,
    dispatchEditorKey,
    handleWidgetToggle,
    cycleThemeMode,
  ]);

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : "Untitled";

  // ── Dashboard View ──
  if (!isEditing) {
    return (
      <div className={`flex flex-col h-screen ${shellBgClass}`}>
        {/* Title Bar (minimal, for window drag) */}
        <div className={`titlebar-drag relative z-40 overflow-visible flex items-center border-b border-editor-border px-4 select-none shrink-0 ${topBarHeightClass} ${chromeBgClass}`}>
          {isMac && <div className="w-[78px] shrink-0" />}
          <div className="flex items-center gap-2 titlebar-no-drag">
            <FileText size={14} className="text-editor-accent" />
            <span className="text-xs font-medium text-editor-text">
              Better TODO
            </span>
          </div>
          <div className="flex-1" />
          <button
            onClick={cycleThemeMode}
            className="titlebar-no-drag p-1.5 rounded hover:bg-editor-border transition-colors"
            title={`Theme: ${themeMode}`}
          >
            {themeMode === "system" ? <Monitor size={14} className="text-editor-subtext" /> : themeMode === "light" ? <Sun size={14} className="text-editor-subtext" /> : <Moon size={14} className="text-editor-subtext" />}
          </button>
          {!isMac && <div className="w-[140px] shrink-0" />}
        </div>

        {/* Dashboard */}
        <div className="flex-1 overflow-hidden">
          <Dashboard onNew={handleNew} onOpen={handleOpen} onOpenRecent={handleOpenRecent} onSettings={() => setSettingsOpen(true)} />
        </div>

        {/* Settings Modal (also available from dashboard) */}
        {settingsOpen && (
          <SettingsPanel
            settings={editorSettings}
            onUpdate={updateSettings}
            onReset={resetSettings}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    );
  }

  // ── Editor View ──
  return (
    <div className={`flex flex-col h-screen ${shellBgClass}`}>
      {/* Title Bar */}
      <div className={`titlebar-drag relative z-40 overflow-visible flex items-center border-b border-editor-border px-4 select-none shrink-0 ${topBarHeightClass} ${chromeBgClass}`}>
        {isMac && <div className="w-[78px] shrink-0" />}
        <div className="flex items-center min-w-0">
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
          <div
            ref={menuBarRef}
            className="flex items-center ml-4 titlebar-no-drag relative z-50"
          >
          {/* File Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === "file" ? null : "file")}
              onMouseEnter={() => setOpenMenu("file")}
              className={`px-2.5 py-1 text-[12px] rounded transition-colors ${
                openMenu === "file" ? "bg-editor-border text-editor-text" : "text-editor-subtext hover:text-editor-text hover:bg-editor-border/50"
              }`}
            >
              File
            </button>
            {openMenu === "file" && (
              <>
                <div className="absolute top-full left-0 h-2 w-56 z-[89]" />
                <div className={`absolute top-full left-0 mt-2 w-56 border rounded-md shadow-xl z-[90] py-1 ${menuPanelClass}`}>
                <MenuItem icon={<FilePlus size={14} />} label="New File" shortcut={sc("Ctrl+N", "⌘+N")} onClick={() => menuAction(handleNew)} />
                <MenuItem icon={<FolderOpen size={14} />} label="Open File" shortcut={sc("Ctrl+O", "⌘+O")} onClick={() => menuAction(handleOpen)} />
                <MenuDivider />
                <MenuItem icon={<Save size={14} />} label="Save" shortcut={sc("Ctrl+S", "⌘+S")} onClick={() => menuAction(handleSave)} />
                <MenuItem icon={<SaveAll size={14} />} label="Save As..." shortcut={sc("Ctrl+Shift+S", "⌘+Shift+S")} onClick={() => menuAction(handleSaveAs)} />
                </div>
              </>
            )}
          </div>

          {/* Edit Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === "edit" ? null : "edit")}
              onMouseEnter={() => setOpenMenu("edit")}
              className={`px-2.5 py-1 text-[12px] rounded transition-colors ${
                openMenu === "edit" ? "bg-editor-border text-editor-text" : "text-editor-subtext hover:text-editor-text hover:bg-editor-border/50"
              }`}
            >
              Edit
            </button>
            {openMenu === "edit" && (
              <>
                <div className="absolute top-full left-0 h-2 w-56 z-[89]" />
                <div className={`absolute top-full left-0 mt-2 w-56 border rounded-md shadow-xl z-[90] py-1 ${menuPanelClass}`}>
                <MenuItem icon={<Undo2 size={14} />} label="Undo" shortcut={sc("Ctrl+Z", "⌘+Z")} onClick={() => menuAction(() => dispatchEditorKey("z", true))} />
                <MenuItem icon={<Redo2 size={14} />} label="Redo" shortcut={sc("Ctrl+Shift+Z", "⌘+Shift+Z")} onClick={() => menuAction(() => dispatchEditorKey("z", true, true))} />
                <MenuDivider />
                <MenuItem icon={<Scissors size={14} />} label="Cut" shortcut={sc("Ctrl+X", "⌘+X")} onClick={() => menuAction(() => document.execCommand("cut"))} />
                <MenuItem icon={<Copy size={14} />} label="Copy" shortcut={sc("Ctrl+C", "⌘+C")} onClick={() => menuAction(() => document.execCommand("copy"))} />
                <MenuItem icon={<ClipboardPaste size={14} />} label="Paste" shortcut={sc("Ctrl+V", "⌘+V")} onClick={() => menuAction(() => document.execCommand("paste"))} />
                <MenuDivider />
                <MenuItem icon={<Search size={14} />} label="Find" shortcut={sc("Ctrl+F", "⌘+F")} onClick={() => menuAction(() => dispatchEditorKey("f", true))} />
                <MenuItem icon={<Replace size={14} />} label="Replace" shortcut={sc("Ctrl+H", "⌘+H")} onClick={() => menuAction(() => dispatchEditorKey("h", true))} />
                <MenuDivider />
                <MenuItem label="Bold" shortcut={sc("Ctrl+B", "⌘+B")} onClick={() => menuAction(() => dispatchEditorKey("b", true))} />
                <MenuItem label="Italic" shortcut={sc("Ctrl+I", "⌘+I")} onClick={() => menuAction(() => dispatchEditorKey("i", true))} />
                <MenuItem label="Underline" shortcut={sc("Ctrl+U", "⌘+U")} onClick={() => menuAction(() => dispatchEditorKey("u", true))} />
                </div>
              </>
            )}
          </div>

          {/* Tasks Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === "tasks" ? null : "tasks")}
              onMouseEnter={() => setOpenMenu("tasks")}
              className={`px-2.5 py-1 text-[12px] rounded transition-colors ${
                openMenu === "tasks" ? "bg-editor-border text-editor-text" : "text-editor-subtext hover:text-editor-text hover:bg-editor-border/50"
              }`}
            >
              Tasks
            </button>
            {openMenu === "tasks" && (
              <>
                <div className="absolute top-full left-0 h-2 w-56 z-[89]" />
                <div className={`absolute top-full left-0 mt-2 w-56 border rounded-md shadow-xl z-[90] py-1 ${menuPanelClass}`}>
                <MenuItem icon={<CheckSquare size={14} />} label="New Task" shortcut={sc("Ctrl+Enter", "⌘+Enter")} onClick={() => menuAction(createNewTask)} />
                <MenuItem icon={<CheckSquare size={14} />} label="Toggle Done" shortcut={sc("Ctrl+D", "⌘+D")} onClick={() => menuAction(() => dispatchEditorKey("d", true))} />
                <MenuItem icon={<XSquare size={14} />} label="Toggle Cancelled" shortcut={sc("Alt+C", "⌥+C")} onClick={() => menuAction(() => dispatchEditorKey("c", false, false, true))} />
                <MenuDivider />
                <MenuItem icon={<Archive size={14} />} label="Archive Done" shortcut={sc("Ctrl+Shift+A", "⌘+Shift+A")} onClick={() => menuAction(() => dispatchEditorKey("a", true, true))} />
                </div>
              </>
            )}
          </div>

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className={`px-2.5 py-1 text-[12px] rounded transition-colors ${
              settingsOpen ? "bg-editor-accent/20 text-editor-accent" : "text-editor-subtext hover:text-editor-text hover:bg-editor-border/50"
            }`}
            title="Settings"
          >
            Settings
          </button>

          {/* Sticker Toggle */}
          <button
            onClick={handleWidgetToggle}
            className={`px-2.5 py-1 text-[12px] rounded transition-colors flex items-center gap-1 ${
              widgetVisible ? "bg-editor-accent/20 text-editor-accent" : "text-editor-subtext hover:text-editor-text hover:bg-editor-border/50"
            }`}
            title={widgetVisible ? "Hide Widget" : "Show Widget"}
          >
            <LayoutGrid size={12} />
            Widget
          </button>
        </div>
        </div>

        <div className={`titlebar-no-drag ml-3 min-w-[240px] max-w-[420px] hidden md:flex items-center gap-2 px-2 py-1 rounded-md border border-editor-border ${nextReminder?.isOverdue ? "bg-red-500/10" : "bg-editor-overlay/60"}`}>
          <span className="text-[10px] text-editor-muted uppercase tracking-wide">Next</span>
          <span className="flex-1 truncate text-[11px] text-editor-subtext" title={nextReminder ? `${nextReminder.projectName} · ${nextReminder.taskText} @${formatDueAt(nextReminder.dueAt)}` : "No active reminders"}>
            {nextReminder ? `${nextReminder.projectName} · ${nextReminder.taskText} @${formatDueAt(nextReminder.dueAt)}` : "No active reminders"}
          </span>
          <span className={`text-[11px] font-medium tabular-nums ${nextReminder?.isOverdue ? "text-red-400" : "text-editor-accent"}`}>
            {nextReminder ? (nextReminder.isOverdue ? "OVERDUE" : formatCountdown(nextReminder.remainingSeconds)) : "--:--"}
          </span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1 titlebar-no-drag relative">
          <button
            onClick={cycleThemeMode}
            className="p-1.5 rounded hover:bg-editor-border transition-colors"
            title={`Theme: ${themeMode}`}
          >
            {themeMode === "system" ? <Monitor size={14} className="text-editor-subtext" /> : themeMode === "light" ? <Sun size={14} className="text-editor-subtext" /> : <Moon size={14} className="text-editor-subtext" />}
          </button>
          <button
            onClick={createNewTask}
            className="p-1.5 rounded hover:bg-editor-border transition-colors"
            title={`Add Task (${sc("Ctrl+Enter", "⌘+Enter")})`}
          >
            <Plus size={14} className="text-editor-subtext" />
          </button>
          <button
            onClick={() => setShowExplorer((prev) => !prev)}
            className={`p-1.5 rounded transition-colors ${showExplorer ? "bg-editor-accent/20" : "hover:bg-editor-border"}`}
            title={`Toggle Explorer (${sc("Ctrl+/", "⌘+/")})`}
          >
            <FolderOpen size={14} className={showExplorer ? "text-editor-accent" : "text-editor-subtext"} />
          </button>

          <button
            onClick={handleOpen}
            className="p-1.5 rounded hover:bg-editor-border transition-colors"
            title={`Open File (${sc("Ctrl+O", "⌘+O")})`}
          >
            <FileText size={14} className="text-editor-subtext" />
          </button>

          <div ref={taskFilterRef} className="relative">
            <button
              onClick={() => setTaskFilterOpen((prev) => !prev)}
              className={`p-1.5 rounded transition-colors ${taskFilterOpen ? "bg-editor-accent/20" : "hover:bg-editor-border"}`}
              title="Filter tasks by keyword/tag"
            >
              <Search size={14} className={taskFilterOpen ? "text-editor-accent" : "text-editor-subtext"} />
            </button>

            {taskFilterOpen && (
              <div className={`absolute right-0 mt-2 w-[320px] border rounded-lg shadow-xl p-3 z-[95] ${menuPanelClass}`}>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={taskFilterKeyword}
                    onChange={(event) => setTaskFilterKeyword(event.target.value)}
                    placeholder="Keyword..."
                    className="flex-1 px-2 py-1.5 text-[12px] rounded border border-editor-border bg-editor-surface text-editor-text focus:outline-none"
                  />
                  <select
                    value={taskFilterTag}
                    onChange={(event) => setTaskFilterTag(event.target.value)}
                    className="w-[120px] px-2 py-1.5 text-[12px] rounded border border-editor-border bg-editor-surface text-editor-text focus:outline-none"
                  >
                    <option value="all">All tags</option>
                    {availableTaskTags.map((tag) => (
                      <option key={tag} value={tag}>@{tag}</option>
                    ))}
                  </select>
                </div>

                <div className="text-[11px] text-editor-muted mb-1">
                  {filteredTasks.length} match{filteredTasks.length === 1 ? "" : "es"}
                </div>

                <div className="max-h-56 overflow-y-auto rounded border border-editor-border/60">
                  {filteredTasks.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-editor-muted">No matching tasks</div>
                  ) : (
                    filteredTasks.slice(0, 80).map((task) => (
                      <button
                        key={`${task.line}-${task.text}`}
                        onClick={() => focusTaskLine(task.line)}
                        className="w-full text-left px-3 py-1.5 text-[11px] border-b last:border-b-0 border-editor-border/40 hover:bg-editor-border/40 transition-colors"
                        title={`Line ${task.line + 1}`}
                      >
                        <span className="text-editor-muted mr-2">#{task.line + 1}</span>
                        <span className="text-editor-text">{task.text}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {!isMac && <div className="w-[140px] shrink-0" />}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden flex">
        {showExplorer && (
          <FileExplorer
            currentFilePath={filePath}
            onOpenFile={handleExplorerOpenFile}
            onClose={() => setShowExplorer(false)}
          />
        )}
        <div className="flex-1 overflow-hidden">
          <TodoEditor initialContent={content} onChange={handleChange} onParsed={handleParsed} settings={editorSettings} />
        </div>
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsPanel
          settings={editorSettings}
          onUpdate={updateSettings}
          onReset={resetSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

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
          <span>{sc("Alt+C", "⌥+C")} cancel</span>
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
