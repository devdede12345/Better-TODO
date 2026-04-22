import { useEffect, useState, useCallback } from "react";
import { FileText, FolderOpen, FilePlus2, Keyboard, Settings, Clock } from "lucide-react";

interface DashboardProps {
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onSettings: () => void;
}

export default function Dashboard({ onNew, onOpen, onOpenRecent, onSettings }: DashboardProps) {
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);

  // Load recent files on mount
  useEffect(() => {
    window.electronAPI?.getRecentFiles?.().then((files) => {
      setRecentFiles(files || []);
    });
  }, []);

  const formatRelativeTime = useCallback((ts: number) => {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }, []);

  const formatPath = useCallback((filePath: string) => {
    const parts = filePath.split(/[\\/]/);
    if (parts.length <= 3) return filePath;
    return "..." + parts.slice(-3).join("/");
  }, []);

  // Keyboard shortcuts: n for New, o for Open, s for Settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        onNew();
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        onOpen();
      } else if (e.key === "," || e.key === "s" || e.key === "S") {
        if (e.key === "," || (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey)) {
          e.preventDefault();
          onSettings();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNew, onOpen, onSettings]);

  return (
    <div className="flex flex-col items-center min-h-full pt-12 pb-10 px-4 select-none">
      {/* Logo / Title */}
      <div className="flex flex-col items-center mb-10">
        <div className="flex items-center gap-3 mb-4">
          <FileText size={40} className="text-editor-accent" strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl font-bold text-editor-text font-mono tracking-tight">
          Better TODO
        </h1>
        <p className="text-sm text-editor-muted mt-2 font-mono">
          A minimal task manager
        </p>
      </div>

      {/* Main content — two columns on wide screens */}
      <div className="flex gap-8 w-[56rem] max-w-[92vw] items-start">
        {/* Left: Actions */}
        <div className="flex flex-col gap-2.5 flex-1 min-w-0">
          <h2 className="text-[11px] font-semibold text-editor-muted uppercase tracking-wider mb-1">
            Start
          </h2>
          <button
            onClick={onNew}
            className="group flex items-center gap-4 px-4 py-2.5 rounded-lg bg-editor-surface border border-editor-border hover:border-editor-accent hover:bg-editor-overlay transition-all duration-200"
          >
            <FilePlus2 size={18} className="text-editor-accent shrink-0" />
            <div className="flex flex-col items-start min-w-0">
              <span className="text-sm font-medium text-editor-text font-mono">New TODO File</span>
              <span className="text-xs text-editor-muted font-mono">Create a new .todo file</span>
            </div>
            <span className="ml-auto text-xs text-editor-muted bg-editor-bg px-2 py-0.5 rounded font-mono border border-editor-border">n</span>
          </button>

          <button
            onClick={onOpen}
            className="group flex items-center gap-4 px-4 py-2.5 rounded-lg bg-editor-surface border border-editor-border hover:border-editor-accent hover:bg-editor-overlay transition-all duration-200"
          >
            <FolderOpen size={18} className="text-editor-peach shrink-0" />
            <div className="flex flex-col items-start min-w-0">
              <span className="text-sm font-medium text-editor-text font-mono">Open TODO File</span>
              <span className="text-xs text-editor-muted font-mono">Open an existing .todo file</span>
            </div>
            <span className="ml-auto text-xs text-editor-muted bg-editor-bg px-2 py-0.5 rounded font-mono border border-editor-border">o</span>
          </button>

          <button
            onClick={onSettings}
            className="group flex items-center gap-4 px-4 py-2.5 rounded-lg bg-editor-surface border border-editor-border hover:border-editor-accent hover:bg-editor-overlay transition-all duration-200"
          >
            <Settings size={18} className="text-editor-mauve shrink-0" />
            <div className="flex flex-col items-start min-w-0">
              <span className="text-sm font-medium text-editor-text font-mono">Settings</span>
              <span className="text-xs text-editor-muted font-mono">Shortcuts, fonts, and more</span>
            </div>
            <span className="ml-auto text-xs text-editor-muted bg-editor-bg px-2 py-0.5 rounded font-mono border border-editor-border">,</span>
          </button>
        </div>

        {/* Right: Recent Files */}
        <div className="flex flex-col gap-2.5 flex-1 min-w-0">
          <h2 className="text-[11px] font-semibold text-editor-muted uppercase tracking-wider mb-1">
            Recent
          </h2>
          {recentFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-12 rounded-lg border border-dashed border-editor-border">
              <Clock size={24} className="text-editor-muted/40 mb-2" />
              <p className="text-xs text-editor-muted font-mono">No recent files</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 overflow-y-auto max-h-[280px] pr-1">
              {recentFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => onOpenRecent(file.path)}
                  className="group flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-editor-surface border border-transparent hover:border-editor-border transition-all duration-150 text-left"
                  title={file.path}
                >
                  <FileText size={14} className="text-editor-accent shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[13px] font-medium text-editor-text font-mono truncate">
                      {file.name}
                    </span>
                    <span className="text-[11px] text-editor-muted font-mono truncate">
                      {formatPath(file.path)}
                    </span>
                  </div>
                  <span className="text-[10px] text-editor-muted font-mono shrink-0">
                    {formatRelativeTime(file.openedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="mt-8 flex items-center gap-2 text-xs text-editor-muted font-mono">
        <Keyboard size={12} />
        <span>Press the highlighted key to quick-launch</span>
      </div>

      {/* Version / footer */}
      <div className="mt-6 text-xs text-editor-muted font-mono opacity-50">
        v1.0.0
      </div>
    </div>
  );
}
