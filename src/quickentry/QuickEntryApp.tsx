import { useState, useEffect, useRef, useCallback } from "react";
import { Send, X } from "lucide-react";

export default function QuickEntryApp() {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Listen for window show event to re-focus
  useEffect(() => {
    const handler = () => {
      setText("");
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    window.electronAPI?.onQuickEntryShow?.(handler);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    window.electronAPI?.quickEntrySubmit(trimmed);
    setText("");
  }, [text]);

  const handleClose = useCallback(() => {
    window.electronAPI?.quickEntryHide();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    },
    [handleSubmit, handleClose]
  );

  return (
    <div className="quickentry-root">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="text-[11px] font-semibold text-white/70">Quick Entry</span>
        <button
          onClick={handleClose}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Close (Esc)"
        >
          <X size={12} className="text-white/40" />
        </button>
      </div>

      {/* Input area */}
      <div className="flex-1 flex flex-col p-3 gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a task and press Enter..."
          className="flex-1 bg-transparent text-white/90 text-[13px] font-mono resize-none outline-none placeholder:text-white/20 leading-relaxed"
          rows={3}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/30">
            Enter to add  ·  Shift+Enter for newline  ·  Esc to close
          </span>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-colors bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={11} />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
