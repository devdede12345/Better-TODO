import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { X, ZoomIn, ZoomOut, AlertTriangle, Activity } from "lucide-react";
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
}

interface ScheduledSegment {
  task: TimelineTask;
  start: number;
  end: number;
  endSource: "due" | "done";
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

/** Build timeline tasks and parse @start/@started + @due/@done tags. */
function buildTimelineTasks(doc: ParsedDocument | null): TimelineTask[] {
  if (!doc) return [];
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
    });
  }
  return out;
}

function toSegment(t: TimelineTask): { start: number; end: number; endSource: "due" | "done" } | null {
  if (!t.startedAt) return null;
  const endDate = t.dueAt ?? t.doneAt;
  if (!endDate) return null;
  const endSource: "due" | "done" = t.dueAt ? "due" : "done";
  const a = t.startedAt.getTime();
  const b = endDate.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return a < b ? { start: a, end: b, endSource } : { start: b, end: a, endSource };
}

function assignLanes(items: { task: TimelineTask; start: number; end: number; endSource: "due" | "done" }[]): ScheduledSegment[] {
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
  return sign * level * 34;
}

// ─── Zoom configuration ─────────────────────────────────────────────────────

interface ZoomConfig {
  label: string;
  pxPerMin: number;
  /** Tick interval in minutes */
  tickMin: number;
  /** Format tick label */
  fmt: (d: Date) => string;
  /** Total span (minutes) to show centered on "now" by default */
  defaultSpanMin: number;
}

const ZOOM_CONFIGS: Record<ZoomLevel, ZoomConfig> = {
  hour: {
    label: "Hour",
    pxPerMin: 4,
    tickMin: 60,
    fmt: (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    defaultSpanMin: 24 * 60,
  },
  day: {
    label: "Day",
    pxPerMin: 0.6,
    tickMin: 24 * 60,
    fmt: (d) => `${d.getMonth() + 1}/${d.getDate()}`,
    defaultSpanMin: 14 * 24 * 60,
  },
  week: {
    label: "Week",
    pxPerMin: 0.12,
    tickMin: 7 * 24 * 60,
    fmt: (d) => `${d.getMonth() + 1}/${d.getDate()}`,
    defaultSpanMin: 12 * 7 * 24 * 60,
  },
  month: {
    label: "Month",
    pxPerMin: 0.03,
    tickMin: 30 * 24 * 60,
    fmt: (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`,
    defaultSpanMin: 12 * 30 * 24 * 60,
  },
};

const ZOOM_ORDER: ZoomLevel[] = ["hour", "day", "week", "month"];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TimelineView({ parsedDoc, content, onClose, onFocusLine }: TimelineViewProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("day");
  const [hoveredTask, setHoveredTask] = useState<TimelineTask | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const tasks = useMemo(() => buildTimelineTasks(parsedDoc), [parsedDoc]);
  const now = useMemo(() => Date.now(), []);

  const scheduledSegments = useMemo(() => {
    const raw = tasks
      .map((task) => {
        const seg = toSegment(task);
        return seg ? { task, start: seg.start, end: seg.end, endSource: seg.endSource } : null;
      })
      .filter((v): v is { task: TimelineTask; start: number; end: number; endSource: "due" | "done" } => v !== null);
    return assignLanes(raw);
  }, [tasks]);

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

  const msToPx = useCallback((ms: number) => ((ms - originMs) / 60000) * cfg.pxPerMin, [originMs, cfg.pxPerMin]);

  // Build tick marks
  const ticks = useMemo(() => {
    const ticks: { ms: number; label: string }[] = [];
    const tickMs = cfg.tickMin * 60000;
    // Snap origin to nearest tick
    const start = Math.ceil(originMs / tickMs) * tickMs;
    for (let t = start; t <= endMs; t += tickMs) {
      ticks.push({ ms: t, label: cfg.fmt(new Date(t)) });
    }
    return ticks;
  }, [originMs, endMs, cfg]);

  // Overlap detection
  const overlapLines = useMemo(() => {
    const over = new Set<number>();
    const sorted = [...scheduledSegments].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].start >= sorted[i].end) break;
        over.add(sorted[i].task.line);
        over.add(sorted[j].task.line);
      }
    }
    return over;
  }, [scheduledSegments]);

  // Scroll to "now" initially
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const nowPx = msToPx(now);
    el.scrollLeft = Math.max(0, nowPx - el.clientWidth / 2);
  }, [zoom, msToPx, now]);

  const nowPx = msToPx(now);

  const handleTaskClick = (line: number) => {
    onFocusLine(line);
    onClose();
  };

  const changeZoom = (delta: number) => {
    const idx = ZOOM_ORDER.indexOf(zoom);
    const next = Math.max(0, Math.min(ZOOM_ORDER.length - 1, idx + delta));
    setZoom(ZOOM_ORDER[next]);
  };

  const maxLane = scheduledSegments.reduce((m, s) => Math.max(m, s.lane), -1);
  const topPad = 48;
  const baseY = topPad + (maxLane < 0 ? 70 : Math.max(70, (Math.floor(maxLane / 2) + 1) * 34 + 20));
  const bottomPad = 52;
  const canvasHeight = baseY + (maxLane < 0 ? 70 : (Math.floor(maxLane / 2) + 1) * 34 + 30) + bottomPad;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full h-full max-w-[1400px] max-h-[900px] bg-editor-bg border border-editor-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border shrink-0">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-editor-accent" />
            <h2 className="text-sm font-medium text-editor-text">Timeline Graph</h2>
            <span className="text-[11px] text-editor-muted ml-2">
              {scheduledSegments.length} segments
              {overlapLines.size > 0 && (
                <span className="ml-2 text-red-400 inline-flex items-center gap-1">
                  <AlertTriangle size={11} />
                  {overlapLines.size} conflict{overlapLines.size === 1 ? "" : "s"}
                </span>
              )}
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
        <div className="flex-1 min-h-0">
          <div ref={scrollRef} className="h-full overflow-auto relative">
            <div style={{ width: timelineWidth, minHeight: canvasHeight, position: "relative" }}>
              <div
                className="sticky top-0 z-20 h-8 border-b border-editor-border bg-editor-bg/95 backdrop-blur-sm"
                style={{ width: timelineWidth }}
              >
                {ticks.map((tk, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex items-center text-[10px] text-editor-muted pl-1 border-l border-editor-border/60"
                    style={{ left: msToPx(tk.ms) }}
                  >
                    {tk.label}
                  </div>
                ))}
                <div
                  className="absolute top-0 h-full flex items-center text-[10px] text-editor-accent font-medium pl-1"
                  style={{ left: nowPx }}
                >
                  <span className="bg-editor-accent/10 px-1 rounded">NOW</span>
                </div>
              </div>

              <div style={{ position: "absolute", top: 32, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
                {ticks.map((tk, i) => (
                  <div key={i} style={{ left: msToPx(tk.ms) }} className="absolute top-0 bottom-0 border-l border-editor-border/25" />
                ))}
                <div style={{ left: nowPx }} className="absolute top-0 bottom-0 border-l-2 border-editor-accent/60" />
              </div>

              <div
                className="absolute border-t-2 border-editor-red/80"
                style={{ left: 0, right: 0, top: baseY }}
              />

              {scheduledSegments.length === 0 && (
                <div className="absolute left-6 right-6 text-[12px] text-editor-muted" style={{ top: baseY + 24 }}>
                  没有可展示的时间段。请在任务中添加
                  <code className="mx-1 text-editor-accent">@start(...)</code>
                  和
                  <code className="mx-1 text-editor-accent">@due(...)</code>
                  。
                </div>
              )}

              {scheduledSegments.map((seg) => {
                const startX = msToPx(seg.start);
                const endX = msToPx(seg.end);
                const y = baseY + laneOffset(seg.lane);
                const color =
                  seg.task.state === "done"
                    ? "#48bb78"
                    : seg.task.state === "cancelled"
                    ? "#f56565"
                    : "#63b3ed";
                const isOverlap = overlapLines.has(seg.task.line);

                return (
                  <div key={seg.task.line}>
                    <div className="absolute w-px bg-white/30" style={{ left: startX, top: Math.min(baseY, y), height: Math.abs(baseY - y) }} />
                    <div className="absolute w-px bg-white/30" style={{ left: endX, top: Math.min(baseY, y), height: Math.abs(baseY - y) }} />

                    <div
                      className="absolute"
                      style={{
                        left: startX,
                        top: y,
                        width: Math.max(2, endX - startX),
                        borderTop: `2px solid ${color}`,
                      }}
                      onMouseEnter={() => setHoveredTask(seg.task)}
                      onMouseLeave={() => setHoveredTask((h) => (h?.line === seg.task.line ? null : h))}
                      onClick={() => handleTaskClick(seg.task.line)}
                      title={`${seg.task.cleanText}\n${fmtRange(seg.start, seg.end)}`}
                    />

                    <button
                      type="button"
                      onClick={() => handleTaskClick(seg.task.line)}
                      onMouseEnter={() => setHoveredTask(seg.task)}
                      onMouseLeave={() => setHoveredTask((h) => (h?.line === seg.task.line ? null : h))}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 bg-editor-bg ${isOverlap ? "ring-2 ring-red-500/80" : ""}`}
                      style={{ left: startX, top: y, borderColor: color }}
                      title={seg.task.cleanText}
                    />
                    <div
                      className="absolute px-1.5 py-0.5 text-[10px] rounded border border-editor-border bg-editor-bg/95 text-editor-subtext whitespace-nowrap"
                      style={{ left: startX, top: y + 12, transform: "translateX(-50%)" }}
                    >
                      Start {fmtDate(new Date(seg.start))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTaskClick(seg.task.line)}
                      onMouseEnter={() => setHoveredTask(seg.task)}
                      onMouseLeave={() => setHoveredTask((h) => (h?.line === seg.task.line ? null : h))}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 bg-editor-bg ${isOverlap ? "ring-2 ring-red-500/80" : ""}`}
                      style={{ left: endX, top: y, borderColor: color }}
                      title={seg.task.cleanText}
                    />
                    <div
                      className="absolute px-1.5 py-0.5 text-[10px] rounded border border-editor-border bg-editor-bg/95 text-editor-subtext whitespace-nowrap"
                      style={{ left: endX, top: y + 12, transform: "translateX(-50%)" }}
                    >
                      End ({seg.endSource}) {fmtDate(new Date(seg.end))}
                    </div>

                    <div
                      className="absolute px-1.5 py-0.5 text-[10px] rounded bg-editor-overlay/80 border border-editor-border text-editor-subtext max-w-[220px] truncate"
                      style={{ left: (startX + endX) / 2, top: y - 18, transform: "translateX(-50%)" }}
                      title={seg.task.cleanText}
                    >
                      {isOverlap && <AlertTriangle size={10} className="inline mr-1 text-red-400" />}
                      {seg.task.cleanText}
                    </div>
                  </div>
                );
              })}
            </div>
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
      </div>
    </div>
  );
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtRange(startMs: number, endMs: number): string {
  return `${fmtDate(new Date(startMs))} → ${fmtDate(new Date(endMs))}`;
}

