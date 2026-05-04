import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Activity, ArrowRight, Clock, AlertTriangle, ExternalLink, Clock3, Palette, CheckCircle2 } from "lucide-react";
import type { ParsedDocument, TaskState } from "../editor/todoParser";

// ─── Types ──────────────────────────────────────────────────────────────────

type ZoomLevel = "hour" | "day" | "week" | "month";

interface TimelineTask {
  line: number;
  rawText: string;
  cleanText: string;
  state: TaskState;
  startedAt: Date | null;
  dueAt: Date | null;
  doneAt: Date | null;
  category: string;
}

interface ScheduledSegment {
  task: TimelineTask;
  start: number;
  end: number;
  endSource: "due" | "done" | "ongoing";
  lane: number;
}

interface TimelineViewProps {
  parsedDoc: ParsedDocument | null;
  content: string;
  onClose: () => void;
  onFocusLine: (lineIndex: number) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse "YYYY-MM-DD HH:mm", "YY-MM-DD HH:mm", "YYYY-MM-DD", etc. */
function parseTimestamp(str: string): Date | null {
  const trimmed = str.trim();
  // Full: 2026-04-21 04:11  or 2026-04-21T04:11
  let m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  // Short: 17-11-03 10:42 (two-digit year)
  m = trimmed.match(/^(\d{2})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?$/);
  if (m) {
    const yy = +m[1];
    const fullYear = yy < 70 ? 2000 + yy : 1900 + yy;
    const d = new Date(fullYear, +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  // Fallback to native Date parse
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/** Strip tags/icons from task display text. */
function cleanTaskText(text: string): string {
  return text
    .replace(/@[\w-]+\([^)]*\)/g, "")
    .replace(/@[\w-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Scan raw content to map each line index to its nearest preceding "Section:" header name.
 *  This is more robust than walking the parser tree because it doesn't depend on indent rules. */
function buildCategoryMapFromContent(content: string, fallback: string = "Other"): Map<number, string> {
  const lines = content.split("\n");
  const map = new Map<number, string>();
  const RE_SECTION = /^(\s*)(.*?):\s*(@.*)?$/;
  let currentCategory = fallback;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    // Detect section header: ends with ":", not a task line, not empty
    if (trimmed.length > 1 && trimmed.endsWith(":") && !/^\s*[☐✔✘]\s+/.test(raw)) {
      const m = raw.match(RE_SECTION);
      if (m) {
        currentCategory = m[2].trim() || fallback;
      }
    }
    map.set(i, currentCategory);
  }
  return map;
}

/** Build timeline tasks and parse @start/@started + @due/@done tags. */
function buildTimelineTasks(doc: ParsedDocument | null, content: string): TimelineTask[] {
  if (!doc) return [];
  const categoryMap = buildCategoryMapFromContent(content);
  const out: TimelineTask[] = [];

  for (const t of doc.tasks) {
    const raw = t.text;
    const startedM = raw.match(/@start(?:ed)?\(([^)]+)\)/);
    const dueM = raw.match(/@due\(([^)]+)\)/);
    const doneM = raw.match(/@done\(([^)]+)\)/);

    const startedAt = startedM ? parseTimestamp(startedM[1]) : null;
    const dueAt = dueM ? parseTimestamp(dueM[1]) : null;
    const doneAt = doneM ? parseTimestamp(doneM[1]) : null;

    out.push({
      line: t.line,
      rawText: raw,
      cleanText: cleanTaskText(raw) || "(empty task)",
      state: t.state,
      startedAt,
      dueAt,
      doneAt,
      category: categoryMap.get(t.line) ?? "Other",
    });
  }
  return out;
}

function toSegment(t: TimelineTask, now: number): { start: number; end: number; endSource: "due" | "done" | "ongoing" } | null {
  if (!t.startedAt) return null;
  const a = t.startedAt.getTime();
  if (!Number.isFinite(a)) return null;

  const endDate = t.dueAt ?? t.doneAt;
  if (!endDate) {
    // Only @start: ongoing open-ended segment that extends to 'now'
    const b = Math.max(now, a + 60 * 60 * 1000); // at least 1h long for visibility
    return { start: a, end: b, endSource: "ongoing" };
  }
  const endSource: "due" | "done" = t.dueAt ? "due" : "done";
  const b = endDate.getTime();
  if (!Number.isFinite(b) || a === b) return null;
  return a < b ? { start: a, end: b, endSource } : { start: b, end: a, endSource };
}

function assignLanes(items: { task: TimelineTask; start: number; end: number; endSource: "due" | "done" | "ongoing" }[]): ScheduledSegment[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const out: ScheduledSegment[] = [];

  for (const item of sorted) {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= item.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    out.push({ ...item, lane });
  }

  return out;
}

function laneOffset(lane: number): number {
  const level = Math.floor(lane / 2) + 1;
  const sign = lane % 2 === 0 ? -1 : 1;
  return sign * level * 56;
}

// ─── Zoom configuration ─────────────────────────────────────────────────────

interface ZoomConfig {
  label: string;
  pxPerMin: number;
  /** Primary tick interval in minutes (smaller, e.g. hours) */
  tickMin: number;
  /** Format primary tick label */
  fmt: (d: Date) => string;
  /** Secondary (major) tick interval in minutes (e.g. days), 0 = none */
  majorTickMin: number;
  /** Format secondary (major) tick label */
  majorFmt: (d: Date) => string;
  /** Total span (minutes) to show centered on "now" by default */
  defaultSpanMin: number;
}

const ZOOM_CONFIGS: Record<ZoomLevel, ZoomConfig> = {
  hour: {
    label: "Hour",
    pxPerMin: 4,
    tickMin: 15,
    fmt: (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    majorTickMin: 60,
    majorFmt: (d) => `${String(d.getHours()).padStart(2, "0")}:00`,
    defaultSpanMin: 12 * 60,
  },
  day: {
    label: "Day",
    pxPerMin: 2.5,
    tickMin: 60,
    fmt: (d) => `${String(d.getHours()).padStart(2, "0")}:00`,
    majorTickMin: 24 * 60,
    majorFmt: (d) => `${d.getMonth() + 1}/${d.getDate()}`,
    defaultSpanMin: 3 * 24 * 60,
  },
  week: {
    label: "Week",
    pxPerMin: 0.35,
    tickMin: 24 * 60,
    fmt: (d) => `${d.getMonth() + 1}/${d.getDate()}`,
    majorTickMin: 7 * 24 * 60,
    majorFmt: (d) => `Week of ${d.getMonth() + 1}/${d.getDate()}`,
    defaultSpanMin: 8 * 7 * 24 * 60,
  },
  month: {
    label: "Month",
    pxPerMin: 0.03,
    tickMin: 30 * 24 * 60,
    fmt: (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`,
    majorTickMin: 0,
    majorFmt: () => "",
    defaultSpanMin: 12 * 30 * 24 * 60,
  },
};

/** Palette of distinct segment colours, cycled per task */
const SEGMENT_COLORS = [
  "#63b3ed", // blue
  "#48bb78", // green
  "#f6ad55", // orange
  "#fc8181", // red
  "#b794f4", // purple
  "#f687b3", // pink
  "#4fd1c5", // teal
  "#fbd38d", // yellow
  "#9ae6b4", // light green
  "#76e4f7", // cyan
];

const ZOOM_ORDER: ZoomLevel[] = ["hour", "day", "week", "month"];

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TimelineView({ parsedDoc, content, onClose, onFocusLine }: TimelineViewProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("day");
  const [hoveredTask, setHoveredTask] = useState<TimelineTask | null>(null);
  const [focusedTask, setFocusedTask] = useState<TimelineTask | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // On Windows: darken the title bar overlay while the timeline is open
  useEffect(() => {
    if (isMac || !window.electronAPI?.setTitleBarOverlay) return;
    window.electronAPI.setTitleBarOverlay("#000000", "#888888");
    return () => {
      // Restore theme colour on close
      const dark = document.documentElement.classList.contains("theme-dark");
      const color = dark ? "#1e1e2e" : "#eef2ff";
      const symbolColor = dark ? "#cdd6f4" : "#1f2937";
      window.electronAPI!.setTitleBarOverlay(color, symbolColor);
    };
  }, []);

  // Close on Escape (dismiss focus panel first, then timeline)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (focusedTask) {
          setFocusedTask(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, focusedTask]);

  const tasks = useMemo(() => buildTimelineTasks(parsedDoc, content), [parsedDoc, content]);
  const now = useMemo(() => Date.now(), []);

  // Build category → color mapping (stable order by first occurrence)
  const categoryColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    for (const t of tasks) {
      if (!map.has(t.category)) {
        map.set(t.category, SEGMENT_COLORS[idx % SEGMENT_COLORS.length]);
        idx++;
      }
    }
    return map;
  }, [tasks]);

  // ── Task buckets for the list below the graph ──
  const { ongoingTasks, futureTasks, archivedTasks } = useMemo(() => {
    const ongoing: TimelineTask[] = [];
    const future: TimelineTask[] = [];
    const archived: TimelineTask[] = [];
    for (const t of tasks) {
      if (t.state === "done") {
        archived.push(t);
        continue;
      }
      if (t.state === "cancelled") continue;
      if (!t.startedAt) continue;
      const startMs = t.startedAt.getTime();
      if (startMs > now) {
        future.push(t);
      } else {
        // started and not yet done/cancelled → ongoing
        ongoing.push(t);
      }
    }
    // Sort: ongoing by start desc, future by start asc, archived by doneAt desc
    ongoing.sort((a, b) => (b.startedAt!.getTime()) - (a.startedAt!.getTime()));
    future.sort((a, b) => (a.startedAt!.getTime()) - (b.startedAt!.getTime()));
    archived.sort((a, b) => {
      const ad = a.doneAt?.getTime() ?? 0;
      const bd = b.doneAt?.getTime() ?? 0;
      return bd - ad;
    });
    return { ongoingTasks: ongoing, futureTasks: future, archivedTasks: archived };
  }, [tasks, now]);

  const scheduledSegments = useMemo(() => {
    const raw = tasks
      .map((task) => {
        const seg = toSegment(task, now);
        return seg ? { task, start: seg.start, end: seg.end, endSource: seg.endSource } : null;
      })
      .filter((v): v is { task: TimelineTask; start: number; end: number; endSource: "due" | "done" | "ongoing" } => v !== null);
    return assignLanes(raw);
  }, [tasks, now]);

  // Timeline span: [min start, max end]  (fallback: centered on now)
  const { originMs, endMs } = useMemo(() => {
    const cfg = ZOOM_CONFIGS[zoom];
    if (scheduledSegments.length === 0) {
      return { originMs: now - cfg.defaultSpanMin * 60000 / 2, endMs: now + cfg.defaultSpanMin * 60000 / 2 };
    }
    let minS = Infinity;
    let maxE = -Infinity;
    for (const seg of scheduledSegments) {
      if (seg.start < minS) minS = seg.start;
      if (seg.end > maxE) maxE = seg.end;
    }
    // Pad 5% on both sides + include "now"
    const span = Math.max(maxE - minS, cfg.defaultSpanMin * 60000 * 0.3);
    const pad = span * 0.1;
    return {
      originMs: Math.min(minS, now) - pad,
      endMs: Math.max(maxE, now) + pad,
    };
  }, [scheduledSegments, zoom, now]);

  const cfg = ZOOM_CONFIGS[zoom];
  const totalMin = (endMs - originMs) / 60000;
  const timelineWidth = Math.max(600, totalMin * cfg.pxPerMin);
  const spanDays = (endMs - originMs) / (24 * 60 * 60 * 1000);

  const msToPx = useCallback((ms: number) => ((ms - originMs) / 60000) * cfg.pxPerMin, [originMs, cfg.pxPerMin]);

  // Build tick marks (minor + major)
  const ticks = useMemo(() => {
    const out: { ms: number; label: string }[] = [];
    const tickMs = cfg.tickMin * 60000;
    const start = Math.ceil(originMs / tickMs) * tickMs;
    for (let t = start; t <= endMs; t += tickMs) {
      out.push({ ms: t, label: cfg.fmt(new Date(t)) });
    }
    return out;
  }, [originMs, endMs, cfg]);

  const majorTicks = useMemo(() => {
    if (!cfg.majorTickMin) return [];
    const out: { ms: number; label: string }[] = [];
    const tickMs = cfg.majorTickMin * 60000;
    const start = Math.ceil(originMs / tickMs) * tickMs;
    for (let t = start; t <= endMs; t += tickMs) {
      out.push({ ms: t, label: cfg.majorFmt(new Date(t)) });
    }
    return out;
  }, [originMs, endMs, cfg]);

  // Scroll to "now" initially
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const nowPx = msToPx(now);
    el.scrollLeft = Math.max(0, nowPx - el.clientWidth / 2);
  }, [zoom, msToPx, now]);

  const nowPx = msToPx(now);

  // Find conflicts for a task (overlapping segments)
  const findConflicts = useCallback(
    (task: TimelineTask): TimelineTask[] => {
      const seg = scheduledSegments.find((s) => s.task.line === task.line);
      if (!seg) return [];
      return scheduledSegments
        .filter((s) => s.task.line !== task.line && s.start < seg.end && s.end > seg.start)
        .map((s) => s.task);
    },
    [scheduledSegments]
  );

  const handleTaskClick = (line: number) => {
    const task = tasks.find((t) => t.line === line);
    if (task) {
      setFocusedTask(task);
    }
  };

  const handleJumpToLine = (line: number) => {
    onFocusLine(line);
    onClose();
  };

  const changeZoom = (delta: number) => {
    const idx = ZOOM_ORDER.indexOf(zoom);
    const next = Math.max(0, Math.min(ZOOM_ORDER.length - 1, idx + delta));
    setZoom(ZOOM_ORDER[next]);
  };

  const headerH = majorTicks.length > 0 ? 52 : 32;
  const rowH = 64;
  const barH = 44;
  const sidebarW = 168;

  // Group segments by category for the Gantt rows.
  const categoryRows = useMemo(() => {
    const map = new Map<string, { name: string; segs: ScheduledSegment[]; taskCount: number }>();
    for (const [cat] of categoryColorMap) {
      map.set(cat, { name: cat, segs: [], taskCount: 0 });
    }
    for (const t of tasks) {
      if (!map.has(t.category)) map.set(t.category, { name: t.category, segs: [], taskCount: 0 });
      map.get(t.category)!.taskCount += 1;
    }
    for (const s of scheduledSegments) {
      const row = map.get(s.task.category);
      if (row) row.segs.push(s);
    }
    return Array.from(map.values()).filter((r) => r.segs.length > 0);
  }, [tasks, scheduledSegments, categoryColorMap]);

  const canvasHeight = headerH + Math.max(rowH, categoryRows.length * rowH);

  const getTaskStatus = useCallback(
    (seg: ScheduledSegment): "completed" | "ongoing" | "upcoming" | "overdue" => {
      const t = seg.task;
      if (t.state === "done") return "completed";
      if (seg.start > now) return "upcoming";
      if (t.dueAt && t.dueAt.getTime() < now) return "overdue";
      return "ongoing";
    },
    [now]
  );

  return (
    <div
      className={`fixed inset-0 z-[200] bg-black/60 flex items-center justify-center px-10 pb-8 ${isMac ? "pt-6" : "pt-10"}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full h-full bg-editor-bg border border-editor-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border shrink-0">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-editor-accent" />
            <h2 className="text-sm font-medium text-editor-text">Timeline Graph</h2>
            <span className="text-[11px] text-editor-muted ml-2">
              Today · {fmtISODate(new Date(now))}
            </span>
            <span className="text-[11px] text-editor-muted/70">
              · {scheduledSegments.length} segments
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-editor-overlay/50 rounded-md p-0.5">
              {ZOOM_ORDER.map((z) => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                    zoom === z
                      ? "bg-editor-accent/20 text-editor-accent"
                      : "text-editor-subtext hover:text-editor-text"
                  }`}
                >
                  {ZOOM_CONFIGS[z].label}
                </button>
              ))}
            </div>
            <button
              onClick={() => changeZoom(-1)}
              className="p-1.5 rounded hover:bg-editor-border transition-colors"
              title="Zoom in"
            >
              <ZoomIn size={14} className="text-editor-subtext" />
            </button>
            <button
              onClick={() => changeZoom(1)}
              className="p-1.5 rounded hover:bg-editor-border transition-colors"
              title="Zoom out"
            >
              <ZoomOut size={14} className="text-editor-subtext" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-editor-border transition-colors"
              title="Close"
            >
              <X size={14} className="text-editor-subtext" />
            </button>
          </div>
        </div>

        {/* Timeline body */}
        <div className="shrink-0 min-h-0 flex" style={{ height: "45%" }}>
          {/* Left sidebar: categories */}
          <div
            className="shrink-0 border-r border-editor-border bg-editor-bg flex flex-col"
            style={{ width: sidebarW }}
          >
            <div style={{ height: headerH }} className="border-b border-editor-border shrink-0" />
            <div className="flex-1 overflow-hidden relative">
              <div
                style={{ transform: `translateY(${-scrollTop}px)`, willChange: "transform" }}
              >
              {categoryRows.length === 0 ? (
                <div className="px-3 py-4 text-[11px] text-editor-muted/70 italic">
                  No categories
                </div>
              ) : (
                categoryRows.map((row) => {
                  const color = categoryColorMap.get(row.name) ?? "#63b3ed";
                  return (
                    <div
                      key={row.name}
                      className="flex items-center gap-2 px-3 border-b border-editor-border/40"
                      style={{ height: rowH }}
                    >
                      <span
                        className="shrink-0 w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] text-editor-text font-medium truncate">
                          {row.name}
                        </div>
                        <div className="text-[10px] text-editor-muted">
                          {row.taskCount} {row.taskCount === 1 ? "task" : "tasks"}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              </div>
            </div>
          </div>

          {/* Right scrollable canvas */}
          <div
            ref={scrollRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            className="flex-1 h-full overflow-auto relative"
          >
            <div style={{ width: timelineWidth, minHeight: canvasHeight, position: "relative" }}>
              {/* ── Sticky two-row header: major labels + minor ticks ── */}
              <div
                className="sticky top-0 z-20 border-b border-editor-border bg-editor-bg"
                style={{ width: timelineWidth, height: headerH }}
              >
                {/* Major date labels (top row) */}
                {majorTicks.map((tk, i) => (
                  <div
                    key={`maj-${i}`}
                    className="absolute top-0 flex items-center text-[11px] text-editor-text font-medium pl-2"
                    style={{ left: msToPx(tk.ms), height: majorTicks.length > 0 ? 22 : 0 }}
                  >
                    {tk.label}
                  </div>
                ))}
                {/* Minor hour/tick labels (bottom row) */}
                {ticks.map((tk, i) => (
                  <div
                    key={`min-${i}`}
                    className="absolute flex items-center text-[10px] text-editor-muted pl-1 border-l border-editor-border/40"
                    style={{
                      left: msToPx(tk.ms),
                      top: majorTicks.length > 0 ? 22 : 0,
                      height: majorTicks.length > 0 ? 30 : 32,
                    }}
                  >
                    {tk.label}
                  </div>
                ))}
              </div>

              {/* Vertical grid lines spanning all rows */}
              <div
                style={{ position: "absolute", top: headerH, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}
              >
                {ticks.map((tk, i) => (
                  <div
                    key={i}
                    style={{ left: msToPx(tk.ms) }}
                    className="absolute top-0 bottom-0 border-l border-editor-border/20"
                  />
                ))}
                {majorTicks.map((tk, i) => (
                  <div
                    key={`mg-${i}`}
                    style={{ left: msToPx(tk.ms) }}
                    className="absolute top-0 bottom-0 border-l border-editor-border/50"
                  />
                ))}
              </div>

              {/* NOW vertical line with pill in header */}
              <div
                className="absolute z-10 pointer-events-none"
                style={{ left: nowPx, top: 0, bottom: 0, width: 0 }}
              >
                <div className="absolute top-0 bottom-0 border-l-2 border-editor-accent/80" />
                <div
                  className="absolute -translate-x-1/2 text-[9px] font-semibold text-white bg-editor-accent px-1.5 py-0.5 rounded"
                  style={{ top: headerH - 18 }}
                >
                  NOW
                </div>
              </div>

              {scheduledSegments.length === 0 && (
                <div
                  className="absolute left-6 right-6 text-[12px] text-editor-muted"
                  style={{ top: headerH + 24 }}
                >
                  没有可展示的时间段。请在任务中添加
                  <code className="mx-1 text-editor-accent">@start(...)</code>
                  和
                  <code className="mx-1 text-editor-accent">@due(...)</code>
                  。
                </div>
              )}

              {/* Category rows with task bars */}
              {categoryRows.map((row, rowIdx) => {
                const rowTop = headerH + rowIdx * rowH;
                const rowColor = categoryColorMap.get(row.name) ?? "#63b3ed";
                return (
                  <div
                    key={row.name}
                    className="absolute left-0 right-0 border-b border-editor-border/40"
                    style={{ top: rowTop, height: rowH }}
                  >
                    {row.segs.map((seg) => {
                      const startX = msToPx(seg.start);
                      const endX = msToPx(seg.end);
                      const status = getTaskStatus(seg);
                      const isOverdue = status === "overdue";
                      const isUpcoming = status === "upcoming";
                      const isCompleted = status === "completed";
                      const barColor = isOverdue ? "#f56565" : rowColor;
                      const rawW = endX - startX;
                      const barW = Math.max(40, rawW);
                      const dashed = isUpcoming || isOverdue;
                      const bg = dashed
                        ? "transparent"
                        : isCompleted
                        ? `${barColor}33`
                        : `${barColor}55`;
                      const timeLabel = `${fmtTime(new Date(seg.start))} - ${
                        seg.endSource === "ongoing" ? "now" : fmtTime(new Date(seg.end))
                      }`;

                      return (
                        <div
                          key={seg.task.line}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleTaskClick(seg.task.line)}
                          onMouseEnter={() => setHoveredTask(seg.task)}
                          onMouseLeave={() =>
                            setHoveredTask((h) => (h?.line === seg.task.line ? null : h))
                          }
                          className="absolute rounded-md px-2 py-1 cursor-pointer overflow-hidden transition-colors hover:brightness-125"
                          style={{
                            left: startX,
                            top: (rowH - barH) / 2,
                            width: barW,
                            height: barH,
                            backgroundColor: bg,
                            border: `1.5px ${dashed ? "dashed" : "solid"} ${barColor}`,
                          }}
                          title={`${seg.task.cleanText}\n${fmtRange(seg.start, seg.end)}`}
                        >
                          <div className="flex items-center gap-1 text-[11px] font-medium text-editor-text truncate leading-tight">
                            {isCompleted && (
                              <CheckCircle2
                                size={11}
                                className="shrink-0"
                                style={{ color: barColor }}
                              />
                            )}
                            <span className="truncate">{seg.task.cleanText}</span>
                          </div>
                          <div className="text-[10px] text-editor-subtext truncate leading-tight mt-0.5">
                            {timeLabel}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Status legend */}
        <div className="shrink-0 border-t border-editor-border px-4 py-2 flex items-center gap-5 text-[11px] text-editor-subtext bg-editor-overlay/10">
          <span className="text-editor-muted">Legend:</span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={12} className="text-editor-green" />
            <span>Completed</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0 border-t-2 border-solid border-editor-accent" />
            <span>Ongoing (In Progress)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0 border-t-2 border-dashed border-editor-accent/70" />
            <span>Upcoming</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0 border-t-2 border-dashed border-editor-red" />
            <span>Overdue</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-0.5 h-4 bg-editor-accent" />
            <span>Current Time</span>
          </span>
        </div>

        {/* Task buckets + Focus panel */}
        <div className="flex-1 min-h-0 border-t border-editor-border overflow-y-auto">
          {focusedTask && (
            <FocusPanel
              task={focusedTask}
              segments={scheduledSegments}
              conflicts={findConflicts(focusedTask)}
              categoryColorMap={categoryColorMap}
              onClose={() => setFocusedTask(null)}
              onJump={handleJumpToLine}
              onPickTask={handleTaskClick}
            />
          )}
          <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-6">
            <TaskBucket
              title="ongoing"
              tasks={ongoingTasks}
              emptyHint="No tasks in progress"
              onPick={handleTaskClick}
              categoryColorMap={categoryColorMap}
            />
            <TaskBucket
              title="future task"
              tasks={futureTasks}
              emptyHint="No scheduled future tasks"
              onPick={handleTaskClick}
              categoryColorMap={categoryColorMap}
            />
            <TaskBucket
              title="archived"
              tasks={archivedTasks}
              emptyHint="No archived tasks"
              onPick={handleTaskClick}
              categoryColorMap={categoryColorMap}
              sortable
            />
          </div>
        </div>

        {/* Footer / hover details */}
        <div className="shrink-0 border-t border-editor-border px-4 py-2 flex items-center gap-4 text-[11px] bg-editor-overlay/10">
          {hoveredTask ? (
            <>
              <span className="text-editor-text truncate max-w-[40%]">{hoveredTask.cleanText}</span>
              {hoveredTask.startedAt && (
                <span className="text-editor-subtext">
                  start {fmtDate(hoveredTask.startedAt)}
                </span>
              )}
              {hoveredTask.dueAt && (
                <span className="text-editor-yellow">due {fmtDate(hoveredTask.dueAt)}</span>
              )}
              {!hoveredTask.dueAt && hoveredTask.doneAt && (
                <span className="text-editor-green">done {fmtDate(hoveredTask.doneAt)}</span>
              )}
            </>
          ) : (
            <span className="text-editor-muted">
              Hover a segment for details · click node/line to jump · <kbd className="text-editor-subtext">Esc</kbd> to close
            </span>
          )}
        </div>

        {/* Category color legend */}
        {categoryColorMap.size > 0 && (
          <div className="shrink-0 border-t border-editor-border/60 px-4 py-2 flex items-center gap-5 flex-wrap bg-editor-overlay/5">
            {Array.from(categoryColorMap.entries()).map(([cat, clr]) => (
              <div key={cat} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full border-2 shrink-0"
                  style={{ borderColor: clr, backgroundColor: clr }}
                />
                <span className="text-[11px] text-editor-text">{cat}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtRange(startMs: number, endMs: number): string {
  return `${fmtDate(new Date(startMs))} → ${fmtDate(new Date(endMs))}`;
}

function formatNodeTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  return `${hh}:00`;
}

function taskDotColor(t: TimelineTask): string {
  if (t.state === "done") return "#48bb78";
  if (t.state === "cancelled") return "#f56565";
  return "#63b3ed";
}

// ─── Duration formatter ─────────────────────────────────────────────────────

function fmtDuration(startMs: number, endMs: number): string {
  const diff = Math.abs(endMs - startMs);
  const totalMin = Math.round(diff / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m > 0 ? `${h}h${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  if (rh > 0) return `${d}d ${rh}h`;
  return `${d}d`;
}

// ─── Focus Panel ─────────────────────────────────────────────────────────────

function FocusPanel({
  task,
  segments,
  conflicts,
  categoryColorMap,
  onClose,
  onJump,
  onPickTask,
}: {
  task: TimelineTask;
  segments: ScheduledSegment[];
  conflicts: TimelineTask[];
  categoryColorMap: Map<string, string>;
  onClose: () => void;
  onJump: (line: number) => void;
  onPickTask: (line: number) => void;
}) {
  const seg = segments.find((s) => s.task.line === task.line);
  const startDate = task.startedAt;
  const endDate = task.dueAt ?? task.doneAt;
  const color = categoryColorMap.get(task.category) ?? "#63b3ed";

  return (
    <div className="mx-4 my-3 rounded-lg border border-editor-border bg-editor-overlay/20 overflow-hidden">
      {/* Focus header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-editor-border/60 bg-editor-overlay/10">
        <span
          className="shrink-0 w-3 h-3 rounded-full border-2 bg-editor-bg"
          style={{ borderColor: color }}
        />
        <span className="text-[13px] font-medium text-editor-text truncate flex-1">
          {task.cleanText}
        </span>
        <button
          type="button"
          onClick={() => onJump(task.line)}
          className="flex items-center gap-1 text-[10px] text-editor-accent hover:text-editor-accent/80 transition-colors"
          title="Jump to task in editor"
        >
          <ExternalLink size={11} />
          <span>Jump</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-editor-border/60 transition-colors"
          title="Close focus panel"
        >
          <X size={12} className="text-editor-subtext" />
        </button>
      </div>

      {/* Focus body */}
      <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px]">
        {/* Time range */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-editor-muted uppercase tracking-wider text-[9px] font-semibold">
            <ArrowRight size={10} />
            <span>Time Range</span>
          </div>
          {startDate ? (
            <div className="text-editor-text">
              {fmtDate(startDate)}
              {endDate ? (
                <span className="text-editor-subtext"> → {fmtDate(endDate)}</span>
              ) : (
                <span className="text-editor-subtext italic"> → ongoing</span>
              )}
            </div>
          ) : (
            <div className="text-editor-muted italic">No start time</div>
          )}
        </div>

        {/* Duration */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-editor-muted uppercase tracking-wider text-[9px] font-semibold">
            <Clock size={10} />
            <span>Duration</span>
          </div>
          {seg ? (
            <div className="text-editor-text font-mono text-[12px]">
              {fmtDuration(seg.start, seg.end)}
              {seg.endSource === "ongoing" && (
                <span className="text-editor-yellow ml-1 font-sans text-[10px]">(ongoing)</span>
              )}
            </div>
          ) : (
            <div className="text-editor-muted italic">—</div>
          )}
        </div>

        {/* Conflicts */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-editor-muted uppercase tracking-wider text-[9px] font-semibold">
            <AlertTriangle size={10} />
            <span>Conflicts ({conflicts.length})</span>
          </div>
          {conflicts.length === 0 ? (
            <div className="text-editor-muted/70 italic">No conflicts</div>
          ) : (
            <ul className="space-y-0.5">
              {conflicts.map((c) => (
                <li key={c.line}>
                  <button
                    type="button"
                    onClick={() => onPickTask(c.line)}
                    className="text-editor-text hover:text-editor-accent truncate transition-colors text-left"
                    title={c.cleanText}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full border mr-1.5"
                      style={{ borderColor: categoryColorMap.get(c.category) ?? "#63b3ed" }}
                    />
                    {c.cleanText}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* State badge */}
      <div className="px-4 pb-2.5 flex items-center gap-2 text-[10px]">
        <span
          className="px-2 py-0.5 rounded-full text-[9px] font-medium uppercase tracking-wider"
          style={{
            backgroundColor: color + "20",
            color: color,
          }}
        >
          {task.state === "done" ? "completed" : task.state === "cancelled" ? "cancelled" : "active"}
        </span>
        {task.doneAt && (
          <span className="text-editor-muted">completed {fmtDate(task.doneAt)}</span>
        )}
      </div>
    </div>
  );
}

function TaskBucket({
  title,
  tasks,
  emptyHint,
  onPick,
  categoryColorMap,
  sortable = false,
}: {
  title: string;
  tasks: TimelineTask[];
  emptyHint: string;
  onPick: (line: number) => void;
  categoryColorMap: Map<string, string>;
  sortable?: boolean;
}) {
  const [sortMode, setSortMode] = useState<"time" | "color">("time");

  // Apply sorting when sortable is enabled. Otherwise, use tasks as provided.
  const displayTasks = useMemo(() => {
    if (!sortable) return tasks;
    const arr = [...tasks];
    if (sortMode === "color") {
      arr.sort((a, b) => {
        const colorA = categoryColorMap.get(a.category) ?? "";
        const colorB = categoryColorMap.get(b.category) ?? "";
        if (colorA !== colorB) return colorA.localeCompare(colorB);
        // Within the same color, keep newest-done first
        const ad = a.doneAt?.getTime() ?? 0;
        const bd = b.doneAt?.getTime() ?? 0;
        return bd - ad;
      });
    }
    // "time" mode keeps the parent-provided order (doneAt desc for archived)
    return arr;
  }, [sortable, sortMode, tasks, categoryColorMap]);

  return (
    <div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-editor-muted mb-3 select-none">
        <span className="flex-1 border-t border-editor-border/60" />
        <span>{title}</span>
        <span className="text-editor-muted/70">·</span>
        <span className="text-editor-muted/70">{tasks.length}</span>
        {sortable && tasks.length > 0 && (
          <button
            type="button"
            onClick={() => setSortMode((m) => (m === "time" ? "color" : "time"))}
            className="ml-1 flex items-center gap-1 px-2 py-0.5 text-[10px] normal-case tracking-normal rounded text-editor-subtext hover:text-editor-text hover:bg-editor-overlay/40 transition-colors"
            title="Click to toggle sort order"
          >
            {sortMode === "time" ? <Clock3 size={10} /> : <Palette size={10} />}
            <span>Sort by {sortMode}</span>
          </button>
        )}
        <span className="flex-1 border-t border-editor-border/60" />
      </div>
      {displayTasks.length === 0 ? (
        <div className="text-[11px] text-editor-muted/70 italic px-1">{emptyHint}</div>
      ) : (
        <ul className="space-y-1.5">
          {displayTasks.map((t) => (
            <li key={t.line}>
              <button
                type="button"
                onClick={() => onPick(t.line)}
                className="w-full flex items-center gap-2 text-left text-[12px] text-editor-text hover:bg-editor-border/40 rounded px-1.5 py-1 transition-colors"
                title={t.cleanText}
              >
                <span
                  className="shrink-0 w-2.5 h-2.5 rounded-full border-2"
                  style={{ borderColor: categoryColorMap.get(t.category) ?? "#63b3ed", backgroundColor: categoryColorMap.get(t.category) ?? "#63b3ed" }}
                />
                <span className="truncate">{t.cleanText}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

