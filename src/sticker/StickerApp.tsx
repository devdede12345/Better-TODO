import { useState, useEffect, useCallback } from "react";
import { Lock, Unlock, X, GripVertical } from "lucide-react";

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

  // Listen for content updates from main window
  useEffect(() => {
    if (!window.electronAPI?.onStickerUpdate) return;
    const cleanup = window.electronAPI.onStickerUpdate((content) => {
      const parsed = parseStickerContent(content);
      setLines(parsed);
      setPendingCount(parsed.filter((l) => l.type === "task" && l.data.state === "pending").length);
    });
    return cleanup;
  }, []);

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

  const handleToggleLock = useCallback(async () => {
    if (!window.electronAPI) return;
    const newLocked = await window.electronAPI.stickerSetLocked(!locked);
    setLocked(newLocked);
  }, [locked]);

  const handleClose = useCallback(() => {
    window.electronAPI?.stickerToggle();
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
      <div className="sticker-handle flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <GripVertical size={12} className="text-white/30" />
          <span className="text-[11px] font-semibold text-white/80">
            Todo Sticker
          </span>
          {pendingCount > 0 && (
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 rounded-full ml-1">
              {pendingCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 sticker-handle-nodrag">
          <button
            onClick={handleToggleLock}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title={locked ? "Unlock (allow interaction)" : "Lock (click-through)"}
          >
            {locked ? (
              <Lock size={12} className="text-yellow-400" />
            ) : (
              <Unlock size={12} className="text-white/50" />
            )}
          </button>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-red-500/30 transition-colors"
            title="Close sticker"
          >
            <X size={12} className="text-white/50" />
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="sticker-body flex-1 overflow-y-auto px-3 py-2">
        {lines.length === 0 && (
          <div className="text-[11px] text-white/30 text-center py-8">
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
              <span className="text-white/80">{cleanText(task.text)}</span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/10 text-[10px] text-white/30">
        <span>{pendingCount} pending</span>
        {locked && <span className="text-yellow-400/60">Locked</span>}
      </div>
    </div>
  );
}
