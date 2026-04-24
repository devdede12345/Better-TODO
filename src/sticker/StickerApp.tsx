import { useState, useEffect, useCallback, useMemo } from "react";
import { Lock, X, GripVertical, Plus, Trash2, Sun, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { normalizeFontFamily } from "../hooks/useEditorSettings";

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

// ─── Widget task model ────────────────────────────────────────────────────

interface WidgetTask {
  lineIndex: number;
  rawText: string;
  cleanText: string;
  state: "pending" | "done" | "cancelled";
  indent: number;
  dueAt: Date | null;
  doneAt: Date | null;
  startedAt: Date | null;
  tags: string[];
}

// ─── Widget helpers ───────────────────────────────────────────────────────

function parseWidgetDate(str: string): Date | null {
  const m = str.trim().match(/^(\d{2,4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (!m) return null;
  const yy = +m[1];
  const year = yy < 100 ? (yy < 70 ? 2000 + yy : 1900 + yy) : yy;
  return new Date(year, +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
}

function extractHashTags(text: string): string[] {
  return text.match(/#[\w\u4e00-\u9fa5]+/g) ?? [];
}

function cleanWidgetText(text: string): string {
  return text
    .replace(/@done\([^)]*\)/g, "")
    .replace(/@cancelled\([^)]*\)/g, "")
    .replace(/@start(?:ed)?\([^)]*\)/g, "")
    .replace(/@lasted\([^)]*\)/g, "")
    .replace(/@est\([^)]*\)/g, "")
    .replace(/@due\([^)]*\)/g, "")
    .replace(/@everyday/g, "")
    .replace(/#[\w\u4e00-\u9fa5]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWidgetTasks(content: string): WidgetTask[] {
  const tasks: WidgetTask[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^Archive:\s*$/.test(trimmed)) break;
    const indent = raw.search(/\S/);
    let state: "pending" | "done" | "cancelled" | null = null;
    let rest = "";
    if (trimmed.startsWith("☐")) { state = "pending"; rest = trimmed.slice(1).trim(); }
    else if (trimmed.startsWith("✔")) { state = "done"; rest = trimmed.slice(1).trim(); }
    else if (trimmed.startsWith("✘")) { state = "cancelled"; rest = trimmed.slice(1).trim(); }
    else continue;
    const dueM = rest.match(/@due\(([^)]+)\)/);
    const doneM = rest.match(/@done\(([^)]+)\)/);
    const startM = rest.match(/@start(?:ed)?\(([^)]+)\)/);
    tasks.push({
      lineIndex: i,
      rawText: rest,
      cleanText: cleanWidgetText(rest),
      state,
      indent,
      dueAt: dueM ? parseWidgetDate(dueM[1]) : null,
      doneAt: doneM ? parseWidgetDate(doneM[1]) : null,
      startedAt: startM ? parseWidgetDate(startM[1]) : null,
      tags: extractHashTags(rest),
    });
  }
  return tasks;
}

function getAccentColor(task: WidgetTask): string {
  if (task.state === "done") return "#22c55e";
  if (task.state === "cancelled") return "#6b7280";
  if (!task.dueAt) return "#8b5cf6";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueAt); due.setHours(0, 0, 0, 0);
  if (due < today) return "#ef4444";
  if (due.getTime() === today.getTime()) return "#f97316";
  return "#3b82f6";
}

function getDateLabel(task: WidgetTask): string {
  const d = task.dueAt ?? task.doneAt;
  if (!d) return "";
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function getTimeLabel(task: WidgetTask): string | null {
  if (!task.dueAt) return null;
  const h = task.dueAt.getHours();
  const m = task.dueAt.getMinutes();
  if (h === 0 && m === 0) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const WEEK_DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function formatNavDate(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK_DAYS[d.getDay()]}`;
}

// ─── Sticker content parsing (unchanged) ──────────────────────────────────

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
  const [newTaskText, setNewTaskText] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });

  // Apply parsed content
  const applyContent = useCallback((content: string, name?: string) => {
    if (name) setFileName(name);
    setRawContent(content);
    const parsed = parseStickerContent(content);
    setLines(parsed);
    setPendingCount(parsed.filter((l) => l.type === "task" && l.data.state === "pending").length);
  }, []);

  const widgetTasks = useMemo(() => parseWidgetTasks(rawContent), [rawContent]);

  const handleRefresh = useCallback(() => {
    window.electronAPI?.stickerRequestContent?.().then((result) => {
      if (result) applyContent(result.content, result.fileName);
    });
  }, [applyContent]);

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

    const getThemeMode = (): "light" | "dark" | "system" => {
      const mode = localStorage.getItem("theme-mode");
      if (mode === "light" || mode === "dark" || mode === "system") return mode;
      return "system";
    };

    const applyThemeFromMode = () => {
      const mode = getThemeMode();
      const dark = mode === "system" ? media.matches : mode === "dark";
      applyTheme(dark);
    };

    applyThemeFromMode();

    const onMediaChange = () => {
      if (getThemeMode() === "system") {
        applyThemeFromMode();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "theme-mode") {
        applyThemeFromMode();
      }
    };

    media.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onStorage);

    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
    };
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
    try {
      const raw = localStorage.getItem("editor-settings");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { fontFamily?: string };
      const fontFamily = normalizeFontFamily(parsed?.fontFamily);
      document.documentElement.style.setProperty("--app-font-family", fontFamily);
      document.body.style.setProperty("--app-font-family", fontFamily);
    } catch {
      // ignore malformed settings
    }
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
      window.electronAPI?.stickerBack?.();
      return;
    }
    window.electronAPI?.stickerToggle?.();
  }, [isWidgetMode]);

  const handleToggleTask = useCallback(async (lineIndex: number) => {
    if (!window.electronAPI?.stickerToggleTask) return;
    await window.electronAPI.stickerToggleTask(lineIndex);
  }, []);

  const handleDeleteTask = useCallback(async (lineIndex: number) => {
    if (!window.electronAPI?.stickerDeleteTask) return;
    await window.electronAPI.stickerDeleteTask(lineIndex);
  }, []);

  const handleAddTask = useCallback(async () => {
    const text = newTaskText.trim();
    if (!text || !window.electronAPI?.stickerAddTask) return;
    const ok = await window.electronAPI.stickerAddTask(text);
    if (ok) setNewTaskText("");
  }, [newTaskText]);

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
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const formatDueAt = (value: number) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${y}/${mo}/${day} ${h}:${m}`;
  };

  // ── Date navigation helpers ──────────────────────────────────────────────
  const prevDay = () => setSelectedDate((d) => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return nd; });
  const nextDay = () => setSelectedDate((d) => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return nd; });

  // ── Widget mode ──────────────────────────────────────────────────────────
  if (isWidgetMode) {
    return (
      <div className="wv2-root">
        {/* Header */}
        <div className="wv2-header">
          <div className="wv2-header-left">
            <GripVertical size={14} className="wv2-grip" />
            <Sun size={12} style={{ color: "#fbbf24", flexShrink: 0 }} />
            <span className="wv2-title">Day Todo</span>
            <span className="wv2-title-arrow">▾</span>
          </div>
          <div className="wv2-date-nav">
            <button className="wv2-nav-btn" onClick={prevDay}>‹</button>
            <span className="wv2-date-label">{formatNavDate(selectedDate)}</span>
            <button className="wv2-nav-btn" onClick={nextDay}>›</button>
          </div>
          <div className="wv2-header-right">
            <button className="wv2-action-btn" onClick={handleToggleLock} title={locked ? "Unpin" : "Pin"}>
              <Lock size={11} style={{ color: locked ? "#fbbf24" : undefined }} />
            </button>
            <button className="wv2-action-btn" onClick={handleRefresh} title="Refresh">
              <RotateCcw size={11} />
            </button>
            <button className="wv2-action-btn wv2-close-btn" onClick={handleClose} title="Close">
              <X size={11} />
            </button>
          </div>
        </div>

        {/* Quick add input */}
        <div className="wv2-input-wrap">
          <input
            className="wv2-input"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAddTask(); } }}
            placeholder="在此添加内容，按回车创建事件"
          />
        </div>

        {/* Task list */}
        <div className="wv2-list">
          {widgetTasks.length === 0 ? (
            <div className="wv2-empty">暂无待办事项</div>
          ) : widgetTasks.map((task) => {
            const accent = getAccentColor(task);
            const dateLabel = getDateLabel(task);
            const timeLabel = getTimeLabel(task);
            const isDone = task.state === "done";
            const isCancelled = task.state === "cancelled";
            return (
              <div key={task.lineIndex} className={`wv2-row ${task.state}`}>
                <div className="wv2-accent" style={{ backgroundColor: accent }} />
                <div className="wv2-row-content">
                  <div className="wv2-row-main">
                    <button
                      className="wv2-checkbox"
                      style={{
                        borderColor: accent,
                        backgroundColor: isDone ? accent : "transparent",
                        color: isDone ? "#fff" : accent,
                      }}
                      onClick={() => void handleToggleTask(task.lineIndex)}
                    >
                      {isDone ? "✓" : isCancelled ? "✗" : ""}
                    </button>
                    <span className={`wv2-text${isDone || isCancelled ? " struck" : ""}`}>
                      {task.cleanText}
                    </span>
                    {task.tags.map((tag, ti) => (
                      <span key={ti} className="wv2-tag">{tag}</span>
                    ))}
                    {dateLabel && <span className="wv2-date">{dateLabel}</span>}
                  </div>
                  {timeLabel && (
                    <div className="wv2-row-sub">
                      <span className="wv2-time">⏰ {timeLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Sticker mode (unchanged) ─────────────────────────────────────────────
  return (
    <div className="sticker-root">
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
            title={locked ? "Unlock position" : "Lock position"}
          >
            <Lock size={12} className={locked ? "text-yellow-400" : "sticker-icon-muted"} />
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
          <div className="text-[11px] sticker-empty text-center py-8">No tasks loaded</div>
        )}
        {lines.map((line, i) => {
          if (line.type === "project") {
            return <div key={i} className="sticker-project">{line.data.name}</div>;
          }
          const task = line.data;
          const cleaned = cleanText(task.text);
          return (
            <div
              key={i}
              className={`sticker-task ${task.state}`}
              style={{ paddingLeft: Math.min(task.indent, 6) * 8 }}
            >
              <span className="sticker-marker" style={{ color: stateColor(task.state) }}>
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
