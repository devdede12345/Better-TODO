import { useState, useEffect, useCallback } from "react";
import { Lock, Unlock, X, GripVertical } from "lucide-react";

interface StickerTask {
  text: string;
  state: "pending" | "done" | "cancelled";
  indent: number;
  lineIndex: number;
}

interface StickerProject {
  name: string;
}

interface ReminderPreview {
  id: string;
  projectName: string;
  taskText: string;
  remainingSeconds: number;
  dueAt: number;
  isOverdue: boolean;
}

type StickerLine = { type: "task"; data: StickerTask } | { type: "project"; data: StickerProject };

function parseStickerContent(content: string): StickerLine[] {
  const lines: StickerLine[] = [];
  for (const [lineIndex, raw] of content.split("\n").entries()) {
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
      lines.push({ type: "task", data: { text: trimmed.slice(1).trim(), state: "pending", indent, lineIndex } });
    } else if (trimmed.startsWith("✔")) {
      lines.push({ type: "task", data: { text: trimmed.slice(1).trim(), state: "done", indent, lineIndex } });
    } else if (trimmed.startsWith("✘")) {
      lines.push({ type: "task", data: { text: trimmed.slice(1).trim(), state: "cancelled", indent, lineIndex } });
    }
  }
  return lines;
}

export default function StickerApp() {
  const [lines, setLines] = useState<StickerLine[]>([]);
  const [locked, setLocked] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [fileName, setFileName] = useState<string>("No file");
  const [isWidgetMode, setIsWidgetMode] = useState(false);
  const [nextReminder, setNextReminder] = useState<ReminderPreview | null>(null);

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

  useEffect(() => {
    const isWidget = new URLSearchParams(window.location.search).get("widget") === "1";
    setIsWidgetMode(isWidget);
    document.body.classList.toggle("sticker-widget-mode", isWidget);
    return () => {
      document.body.classList.remove("sticker-widget-mode");
    };
  }, []);

  useEffect(() => {
    if (!isWidgetMode) {
      setNextReminder(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      if (!window.electronAPI?.getNextReminder) return;
      const reminder = await window.electronAPI.getNextReminder();
      if (alive) setNextReminder(reminder);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [isWidgetMode]);

  const handleToggleLock = useCallback(async () => {
    if (!window.electronAPI) return;
    const newLocked = await window.electronAPI.stickerSetLocked(!locked);
    setLocked(newLocked);
  }, [locked]);

  const handleClose = useCallback(() => {
    if (isWidgetMode) {
      window.electronAPI?.widgetToggle?.();
      return;
    }
    window.electronAPI?.stickerToggle?.();
  }, [isWidgetMode]);

  const handleToggleTask = useCallback(async (lineIndex: number) => {
    if (!window.electronAPI?.stickerToggleTask) return;
    await window.electronAPI.stickerToggleTask(lineIndex);
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
      .replace(/@\d{4}[\/.]\d{2}[\/.]\d{2}\s+\d{2}:\d{2}/g, "")
      .replace(/@\d{2}[\/.]\d{2}\s+\d{2}:\d{2}/g, "")
      .replace(/@\d{8}/g, "")
      .replace(/@\d{4}(?=\s|$)/g, "")
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

  const formatCountdown = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    if (safe >= 24 * 60 * 60) {
      const days = Math.floor(safe / (24 * 60 * 60));
      const hours = Math.floor((safe % (24 * 60 * 60)) / 3600);
      return `${days}d ${hours}h`;
    }
    if (safe >= 60 * 60) {
      const hours = Math.floor(safe / 3600);
      const mins = Math.floor((safe % 3600) / 60);
      const secs = safe % 60;
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDueAt = (value: number) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString([], {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className={`sticker-root ${isWidgetMode ? "sticker-root-widget" : ""}`}>
      {/* Header / drag handle */}
      <div className={`sticker-handle ${locked ? "sticker-handle-locked" : ""} flex items-center justify-between px-3 py-2 border-b sticker-border`}>
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
            title={isWidgetMode ? "Close widget" : "Close sticker"}
          >
            <X size={12} className="sticker-icon-muted" />
          </button>
        </div>
      </div>

      {isWidgetMode && (
        <div className={`widget-reminder-strip ${nextReminder?.isOverdue ? "overdue" : ""}`}>
          <span className="widget-reminder-label">Next</span>
          <span
            className="widget-reminder-task"
            title={nextReminder ? `${nextReminder.projectName} · ${nextReminder.taskText} @${formatDueAt(nextReminder.dueAt)}` : "No active reminders"}
          >
            {nextReminder ? `${nextReminder.projectName} · ${nextReminder.taskText}` : "No active reminders"}
          </span>
          <span className="widget-reminder-time">
            {nextReminder
              ? (nextReminder.isOverdue ? "OVERDUE" : formatCountdown(nextReminder.remainingSeconds))
              : "--:--"}
          </span>
        </div>
      )}

      {/* Task list */}
      <div className={`sticker-body flex-1 overflow-y-auto px-3 py-2 ${locked ? "locked" : ""}`}>
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
          const cleaned = cleanText(task.text);

          if (isWidgetMode) {
            return (
              <div
                key={i}
                className={`widget-task-button ${task.state}`}
                style={{ marginLeft: Math.min(task.indent, 4) * 6 }}
                title={cleaned}
              >
                <button
                  type="button"
                  className="widget-task-marker-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleToggleTask(task.lineIndex);
                  }}
                  title="Toggle task"
                >
                  <span className="widget-task-marker" style={{ color: stateColor(task.state) }}>
                    {markerChar(task.state)}
                  </span>
                </button>
                <span className="widget-task-label">{cleaned}</span>
              </div>
            );
          }

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
              <span className="sticker-task-text">{cleaned}</span>
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
