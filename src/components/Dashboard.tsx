import { useEffect } from "react";
import { FileText, FolderOpen, FilePlus2, Keyboard } from "lucide-react";

interface DashboardProps {
  onNew: () => void;
  onOpen: () => void;
}

export default function Dashboard({ onNew, onOpen }: DashboardProps) {
  // Keyboard shortcuts: n for New, o for Open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is focused on an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        onNew();
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNew, onOpen]);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-editor-bg select-none">
      {/* Logo / Title */}
      <div className="flex flex-col items-center mb-12">
        <div className="flex items-center gap-3 mb-4">
          <FileText size={40} className="text-editor-accent" strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl font-bold text-editor-text font-mono tracking-tight">
          Better TODO
        </h1>
        <p className="text-sm text-editor-muted mt-2 font-mono">
          A minimal, editor-like task manager
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 w-72">
        <button
          onClick={onNew}
          className="group flex items-center gap-4 px-5 py-3.5 rounded-lg bg-editor-surface border border-editor-border hover:border-editor-accent hover:bg-editor-overlay transition-all duration-200"
        >
          <FilePlus2
            size={20}
            className="text-editor-accent group-hover:text-editor-accent transition-colors"
          />
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium text-editor-text font-mono">
              New TODO File
            </span>
            <span className="text-xs text-editor-muted font-mono">
              Create a new .todo file
            </span>
          </div>
          <span className="ml-auto text-xs text-editor-muted bg-editor-bg px-2 py-0.5 rounded font-mono border border-editor-border">
            n
          </span>
        </button>

        <button
          onClick={onOpen}
          className="group flex items-center gap-4 px-5 py-3.5 rounded-lg bg-editor-surface border border-editor-border hover:border-editor-accent hover:bg-editor-overlay transition-all duration-200"
        >
          <FolderOpen
            size={20}
            className="text-editor-peach group-hover:text-editor-peach transition-colors"
          />
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium text-editor-text font-mono">
              Open TODO File
            </span>
            <span className="text-xs text-editor-muted font-mono">
              Open an existing .todo file
            </span>
          </div>
          <span className="ml-auto text-xs text-editor-muted bg-editor-bg px-2 py-0.5 rounded font-mono border border-editor-border">
            o
          </span>
        </button>
      </div>

      {/* Keyboard hint */}
      <div className="mt-10 flex items-center gap-2 text-xs text-editor-muted font-mono">
        <Keyboard size={12} />
        <span>Press the highlighted key to quick-launch</span>
      </div>

      {/* Version / footer */}
      <div className="absolute bottom-4 text-xs text-editor-muted font-mono opacity-50">
        v1.0.0
      </div>
    </div>
  );
}
