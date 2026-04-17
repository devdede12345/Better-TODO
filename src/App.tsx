import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  FolderOpen,
  Save,
  CheckSquare,
  Square,
  XSquare,
  Clock,
} from "lucide-react";
import TodoEditor from "./components/TodoEditor";
import Dashboard from "./components/Dashboard";
import { type ParsedDocument, formatMinutes } from "./editor/todoParser";

function App() {
  const [content, setContent] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [stats, setStats] = useState({ total: 0, done: 0, pending: 0, cancelled: 0, estMinutes: 0 });
  const [parsedDoc, setParsedDoc] = useState<ParsedDocument | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Keyboard shortcuts (only active when editing)
  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault();
        handleSaveAs();
      } else if (e.ctrlKey && e.key === "o") {
        e.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing, handleSave, handleSaveAs, handleOpen]);

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : "Untitled";

  // ── Dashboard View ──
  if (!isEditing) {
    return (
      <div className="flex flex-col h-screen bg-editor-bg">
        {/* Title Bar (minimal, for window drag) */}
        <div className="titlebar-drag flex items-center h-9 bg-editor-surface border-b border-editor-border px-4 select-none shrink-0">
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
    <div className="flex flex-col h-screen bg-editor-bg">
      {/* Title Bar */}
      <div className="titlebar-drag flex items-center h-9 bg-editor-surface border-b border-editor-border px-4 select-none shrink-0">
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

        <div className="flex-1" />

        <div className="flex items-center gap-1 titlebar-no-drag">
          <button
            onClick={handleOpen}
            className="p-1.5 rounded hover:bg-editor-border transition-colors"
            title="Open File (Ctrl+O)"
          >
            <FolderOpen size={14} className="text-editor-subtext" />
          </button>
          <button
            onClick={handleSave}
            className="p-1.5 rounded hover:bg-editor-border transition-colors"
            title="Save (Ctrl+S)"
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
      <div className="flex items-center h-6 bg-editor-surface border-t border-editor-border px-4 select-none shrink-0">
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
          <span>Ctrl+D done</span>
          <span>Alt+C cancel</span>
          <span>Ctrl+Enter new</span>
          <span>Ctrl+B bold</span>
          <span>Ctrl+I italic</span>
          <span>Ctrl+U underline</span>
          <span>Ctrl+Shift+A archive</span>
        </div>
      </div>
    </div>
  );
}

export default App;
