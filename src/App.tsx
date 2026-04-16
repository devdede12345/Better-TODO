import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  FolderOpen,
  Save,
  CheckSquare,
  Archive,
  Clock,
  Square,
  XSquare,
} from "lucide-react";
import TodoEditor from "./components/TodoEditor";

function App() {
  const [content, setContent] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [stats, setStats] = useState({ total: 0, done: 0, pending: 0, cancelled: 0 });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate stats from content
  const updateStats = useCallback((text: string) => {
    const lines = text.split("\n");
    let total = 0, done = 0, pending = 0, cancelled = 0;
    for (const line of lines) {
      if (line.includes("☐") || line.includes("✔") || line.includes("✘")) {
        total++;
        if (line.includes("✔")) done++;
        else if (line.includes("✘")) cancelled++;
        else pending++;
      }
    }
    setStats({ total, done, pending, cancelled });
  }, []);

  // Load default file on startup
  useEffect(() => {
    async function loadDefault() {
      if (window.electronAPI) {
        const result = await window.electronAPI.getDefaultFile();
        if (result) {
          setContent(result.content);
          setFilePath(result.path);
          updateStats(result.content);
        }
      } else {
        // Fallback for browser dev
        const defaultContent = `My Project:
  ☐ Welcome to Todo Studio! @started
  ☐ Use ☐ for pending tasks
  ✔ Use ✔ for completed tasks @done
  ✘ Use ✘ for cancelled tasks @cancelled
  ☐ Add @tags and +projects to organize
  ☐ Nest tasks with indentation
  ☐ Press Ctrl+D to toggle task completion
  ☐ Press Ctrl+Shift+A to archive done tasks
  ☐ Due dates work too @due(2025-12-31)

Archive:
`;
        setContent(defaultContent);
        updateStats(defaultContent);
      }
    }
    loadDefault();
  }, [updateStats]);

  const handleChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      setIsDirty(true);
      updateStats(newContent);

      // Auto-save after 2 seconds of inactivity
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        if (window.electronAPI) {
          await window.electronAPI.saveFile(newContent);
          setIsDirty(false);
        }
      }, 2000);
    },
    [updateStats]
  );

  const handleOpen = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openFile();
    if (result) {
      setContent(result.content);
      setFilePath(result.path);
      setIsDirty(false);
      updateStats(result.content);
      // Push new content into the editor
      (window as any).__todoEditorSetContent?.(result.content);
    }
  }, [updateStats]);

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

  // Keyboard shortcuts
  useEffect(() => {
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
  }, [handleSave, handleSaveAs, handleOpen]);

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : "Untitled";

  return (
    <div className="flex flex-col h-screen bg-editor-bg">
      {/* Title Bar */}
      <div className="titlebar-drag flex items-center h-9 bg-editor-surface border-b border-editor-border px-4 select-none shrink-0">
        <div className="flex items-center gap-2 titlebar-no-drag">
          <FileText size={14} className="text-editor-accent" />
          <span className="text-xs font-medium text-editor-text">
            Todo Studio
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
        {content !== "" && (
          <TodoEditor initialContent={content} onChange={handleChange} />
        )}
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
          <span>Ctrl+D toggle</span>
          <span>Ctrl+Enter new task</span>
          <span>Ctrl+Shift+A archive</span>
        </div>
      </div>
    </div>
  );
}

export default App;
