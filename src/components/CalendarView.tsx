import { useEffect, useMemo, useState, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Gift,
  ExternalLink,
  Circle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { ParsedDocument, TaskState } from "../editor/todoParser";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CalendarViewProps {
  parsedDoc: ParsedDocument | null;
  content: string;
  onClose: () => void;
  onFocusLine: (lineIndex: number) => void;
}

interface CalEvent {
  line: number;
  title: string;
  rawText: string;
  category: string;
  color: string;
  start: Date; // date-only (midnight)
  end: Date;   // date-only (midnight), inclusive
  isMultiDay: boolean;
  state: TaskState;
  isBirthday: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseTimestamp(str: string): Date | null {
  const trimmed = str.trim();
  let m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  m = trimmed.match(/^(\d{2})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?$/);
  if (m) {
    const yy = +m[1];
    const fullYear = yy < 70 ? 2000 + yy : 1900 + yy;
    const d = new Date(fullYear, +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Days between two date-only Dates (b - a). */
function dayDiff(a: Date, b: Date): number {
  const msPerDay = 86400000;
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / msPerDay);
}

/** JS Date.getDay() returns 0=Sun..6=Sat. Convert to Monday-first: 0=Mon..6=Sun */
function dowMondayFirst(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Build a 6-row (42 cell) Monday-first grid starting from the Monday of the week containing day 1. */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = dowMondayFirst(first);
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function cleanTaskText(text: string): string {
  return text
    .replace(/@[\w-]+\([^)]*\)/g, "")
    .replace(/@[\w-]+/g, "")
    .replace(/#[\w\u4e00-\u9fa5-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCategoryMapFromContent(content: string, fallback = "Other"): Map<number, string> {
  const lines = content.split("\n");
  const map = new Map<number, string>();
  const RE_SECTION = /^(\s*)(.*?):\s*(@.*)?$/;
  let current = fallback;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed.length > 1 && trimmed.endsWith(":") && !/^\s*[☐✔✘]\s+/.test(raw)) {
      const m = raw.match(RE_SECTION);
      if (m) current = m[2].trim() || fallback;
    }
    map.set(i, current);
  }
  return map;
}

const SEGMENT_COLORS = [
  "#63b3ed",
  "#48bb78",
  "#f6ad55",
  "#fc8181",
  "#b794f4",
  "#f687b3",
  "#4fd1c5",
  "#fbd38d",
  "#9ae6b4",
  "#76e4f7",
];

function fmtISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildEvents(doc: ParsedDocument | null, content: string): CalEvent[] {
  if (!doc) return [];
  const catMap = buildCategoryMapFromContent(content);
  const catColor = new Map<string, string>();
  let ci = 0;
  const out: CalEvent[] = [];

  for (const t of doc.tasks) {
    const raw = t.text;
    // Skip rituals (daily recurring) — they belong in the Timeline rituals section
    if (/@(everyday|daily|ritual)\b/i.test(raw)) continue;

    const startedM = raw.match(/@start(?:ed)?\(([^)]+)\)/);
    const dueM = raw.match(/@due\(([^)]+)\)/);
    const doneM = raw.match(/@done\(([^)]+)\)/);
    const birthdayM = /@birthday\b|@event\b/i.test(raw);

    let start: Date | null = null;
    let end: Date | null = null;

    if (startedM) start = parseTimestamp(startedM[1]);
    if (dueM) end = parseTimestamp(dueM[1]);
    if (!end && doneM) end = parseTimestamp(doneM[1]);

    // Require at least one concrete date
    if (!start && !end) continue;
    if (!start) start = end;
    if (!end) end = start;
    if (!start || !end) continue;

    const s = startOfDay(start);
    const e = startOfDay(end);
    const lo = s <= e ? s : e;
    const hi = s <= e ? e : s;
    const isMultiDay = dayDiff(lo, hi) >= 1;

    const category = catMap.get(t.line) ?? "Other";
    if (!catColor.has(category)) {
      catColor.set(category, SEGMENT_COLORS[ci % SEGMENT_COLORS.length]);
      ci++;
    }

    out.push({
      line: t.line,
      title: cleanTaskText(raw) || "(empty task)",
      rawText: raw,
      category,
      color: catColor.get(category)!,
      start: lo,
      end: hi,
      isMultiDay,
      state: t.state,
      isBirthday: birthdayM,
    });
  }
  return out;
}

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CalendarView({ parsedDoc, content, onClose, onFocusLine }: CalendarViewProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [cursor, setCursor] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [layers, setLayers] = useState({ tasks: true, longTerm: true, events: true });

  // Title bar overlay handling (match TimelineView)
  useEffect(() => {
    if (isMac || !window.electronAPI?.setTitleBarOverlay) return;
    window.electronAPI.setTitleBarOverlay("#000000", "#888888");
    return () => {
      const dark = document.documentElement.classList.contains("theme-dark");
      const color = dark ? "#1e1e2e" : "#eef2ff";
      const symbolColor = dark ? "#cdd6f4" : "#1f2937";
      window.electronAPI!.setTitleBarOverlay(color, symbolColor);
    };
  }, []);

  // Close on Esc
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const events = useMemo(() => buildEvents(parsedDoc, content), [parsedDoc, content]);

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (e.isBirthday) return layers.events;
        if (e.isMultiDay) return layers.longTerm;
        return layers.tasks;
      }),
    [events, layers]
  );

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthGrid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  // Build 6 weeks (rows), each with 7 days and overlapping events for that week
  const weeks = useMemo(() => {
    const rows: { days: Date[]; spans: { event: CalEvent; startCol: number; endCol: number; lane: number }[] }[] = [];
    for (let r = 0; r < 6; r++) {
      const days = monthGrid.slice(r * 7, r * 7 + 7);
      const weekStart = days[0];
      const weekEnd = days[6];
      // Events overlapping this week
      const overlapping = filtered.filter((e) => e.end >= weekStart && e.start <= weekEnd);
      // Render spans only for multi-day events here; single-day events are rendered inline in cells
      const multi = overlapping.filter((e) => e.isMultiDay);
      multi.sort((a, b) => a.start.getTime() - b.start.getTime());
      const laneEnds: number[] = []; // last col occupied per lane
      const spans: { event: CalEvent; startCol: number; endCol: number; lane: number }[] = [];
      for (const ev of multi) {
        const clampStart = ev.start < weekStart ? weekStart : ev.start;
        const clampEnd = ev.end > weekEnd ? weekEnd : ev.end;
        const startCol = dayDiff(weekStart, clampStart);
        const endCol = dayDiff(weekStart, clampEnd);
        let lane = laneEnds.findIndex((last) => last < startCol);
        if (lane < 0) {
          lane = laneEnds.length;
          laneEnds.push(endCol);
        } else {
          laneEnds[lane] = endCol;
        }
        spans.push({ event: ev, startCol, endCol, lane });
      }
      rows.push({ days, spans });
    }
    return rows;
  }, [monthGrid, filtered]);

  // Per-day single-day events (for inline rendering inside each cell)
  const singleDayByKey = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of filtered) {
      if (e.isMultiDay) continue;
      const k = fmtISODate(e.start);
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
    return map;
  }, [filtered]);

  const selectedEvents = useMemo(() => {
    const out: CalEvent[] = [];
    for (const e of filtered) {
      if (selectedDate >= e.start && selectedDate <= e.end) out.push(e);
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [filtered, selectedDate]);

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  const handleJump = useCallback(
    (line: number) => {
      onFocusLine(line);
      onClose();
    },
    [onFocusLine, onClose]
  );

  // Unique categories shown (for sidebar legend)
  const categoryEntries = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of filtered) {
      if (!seen.has(e.category)) seen.set(e.category, e.color);
    }
    return Array.from(seen.entries());
  }, [filtered]);

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
            <CalendarDays size={16} className="text-editor-accent" />
            <h2 className="text-sm font-medium text-editor-text">Calendar</h2>
            <span className="text-[11px] text-editor-muted ml-2">
              Today · {fmtISODate(today)}
            </span>
            <span className="text-[11px] text-editor-muted/70">
              · {filtered.length} events
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              className="p-1.5 rounded hover:bg-editor-border transition-colors"
              title="Previous month"
            >
              <ChevronLeft size={14} className="text-editor-subtext" />
            </button>
            <span className="text-sm text-editor-text font-medium min-w-[140px] text-center select-none">
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              onClick={goNext}
              className="p-1.5 rounded hover:bg-editor-border transition-colors"
              title="Next month"
            >
              <ChevronRight size={14} className="text-editor-subtext" />
            </button>
            <button
              onClick={goToday}
              className="px-2.5 py-1 text-[11px] rounded text-editor-subtext hover:bg-editor-border hover:text-editor-text transition-colors"
              title="Jump to today"
            >
              Today
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

        {/* Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left sidebar */}
          <div className="w-56 shrink-0 border-r border-editor-border overflow-y-auto p-3 space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-editor-muted mb-2 select-none">
                Calendar Layers
              </div>
              <div className="space-y-1">
                {([
                  ["tasks", "Tasks"],
                  ["longTerm", "Long-term Tasks"],
                  ["events", "Birthdays & Events"],
                ] as const).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-[12px] text-editor-text cursor-pointer py-1 px-1 rounded hover:bg-editor-overlay/30"
                  >
                    <input
                      type="checkbox"
                      checked={layers[key]}
                      onChange={(e) => setLayers((s) => ({ ...s, [key]: e.target.checked }))}
                      className="accent-editor-accent"
                    />
                    <span className="flex-1">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-editor-muted mb-2 select-none">
                Legend
              </div>
              <div className="space-y-1.5 text-[11px] text-editor-subtext">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-6 h-1.5 rounded-sm bg-editor-accent/40 border border-editor-accent/70" />
                  <span>Long-term Task</span>
                </div>
                <div className="flex items-center gap-2">
                  <Circle size={10} className="text-editor-accent fill-editor-accent" />
                  <span>Single-day Task</span>
                </div>
                <div className="flex items-center gap-2">
                  <Gift size={12} className="text-editor-mauve" />
                  <span>Birthday / Event</span>
                </div>
              </div>
            </div>

            {categoryEntries.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-editor-muted mb-2 select-none">
                  Categories
                </div>
                <div className="space-y-1">
                  {categoryEntries.map(([cat, color]) => (
                    <div key={cat} className="flex items-center gap-2 text-[11px] text-editor-text">
                      <span
                        className="shrink-0 w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate">{cat}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Month grid */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Weekday header */}
            <div className="grid grid-cols-7 border-b border-editor-border shrink-0">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-2 text-[10px] uppercase tracking-[0.14em] text-editor-muted border-l border-editor-border/40 first:border-l-0 select-none"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Six weeks */}
            <div className="flex-1 flex flex-col min-h-0">
              {weeks.map((wk, ri) => {
                const maxLane = wk.spans.reduce((m, s) => Math.max(m, s.lane), -1);
                const laneArea = (maxLane + 1) * 20; // 20px per lane
                return (
                  <div
                    key={ri}
                    className="relative flex-1 min-h-[110px] border-b border-editor-border/60 last:border-b-0"
                  >
                    {/* 7 day cells */}
                    <div className="grid grid-cols-7 h-full">
                      {wk.days.map((d, ci) => {
                        const isCurMonth = d.getMonth() === month;
                        const isToday = sameDay(d, today);
                        const isSelected = sameDay(d, selectedDate);
                        const key = fmtISODate(d);
                        const singles = singleDayByKey.get(key) ?? [];
                        return (
                          <button
                            key={ci}
                            type="button"
                            onClick={() => setSelectedDate(d)}
                            className={`relative border-l border-editor-border/40 first:border-l-0 px-1.5 py-1.5 flex flex-col items-stretch text-left transition-colors overflow-hidden ${
                              isCurMonth ? "bg-transparent" : "bg-editor-overlay/10"
                            } ${isSelected ? "ring-1 ring-inset ring-editor-accent" : "hover:bg-editor-overlay/20"}`}
                          >
                            <div className="flex items-center justify-between shrink-0">
                              <span
                                className={`text-[11px] font-medium ${
                                  isCurMonth ? "text-editor-text" : "text-editor-muted/70"
                                } ${
                                  isToday
                                    ? "bg-editor-accent text-white rounded-full w-5 h-5 flex items-center justify-center"
                                    : ""
                                }`}
                              >
                                {d.getDate()}
                              </span>
                              {singles.length > 2 && (
                                <span className="text-[9px] text-editor-muted">
                                  +{singles.length - 2}
                                </span>
                              )}
                            </div>
                            {/* Space reserved for multi-day bars */}
                            <div style={{ height: laneArea }} className="shrink-0" />
                            {/* Single-day events inline */}
                            <div className="flex-1 flex flex-col gap-0.5 mt-0.5 overflow-hidden">
                              {singles.slice(0, 2).map((ev) => (
                                <div
                                  key={ev.line}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDate(d);
                                  }}
                                  className="flex items-center gap-1 min-w-0"
                                  title={ev.title}
                                >
                                  {ev.isBirthday ? (
                                    <Gift size={10} className="shrink-0 text-editor-mauve" />
                                  ) : ev.state === "done" ? (
                                    <CheckCircle2
                                      size={10}
                                      className="shrink-0"
                                      style={{ color: ev.color }}
                                    />
                                  ) : ev.state === "cancelled" ? (
                                    <XCircle size={10} className="shrink-0 text-editor-muted" />
                                  ) : (
                                    <span
                                      className="shrink-0 w-1.5 h-1.5 rounded-full"
                                      style={{ backgroundColor: ev.color }}
                                    />
                                  )}
                                  <span
                                    className={`text-[10px] truncate ${
                                      ev.state === "cancelled"
                                        ? "text-editor-muted line-through"
                                        : "text-editor-text"
                                    }`}
                                  >
                                    {ev.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Multi-day span bars overlay */}
                    <div
                      className="absolute left-0 right-0 pointer-events-none"
                      style={{ top: 26 /* after day number row */ }}
                    >
                      {wk.spans.map((sp) => {
                        const leftPct = (sp.startCol / 7) * 100;
                        const widthPct = ((sp.endCol - sp.startCol + 1) / 7) * 100;
                        const color = sp.event.color;
                        const continuesLeft = sp.event.start < wk.days[0];
                        const continuesRight = sp.event.end > wk.days[6];
                        return (
                          <div
                            key={`${sp.event.line}-${sp.lane}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDate(sp.event.start > wk.days[0] ? sp.event.start : wk.days[0]);
                            }}
                            className="absolute flex items-center gap-1 px-2 text-[10px] font-medium cursor-pointer pointer-events-auto overflow-hidden transition-colors hover:brightness-125"
                            style={{
                              left: `calc(${leftPct}% + 2px)`,
                              width: `calc(${widthPct}% - 4px)`,
                              top: sp.lane * 20,
                              height: 18,
                              backgroundColor: `${color}33`,
                              borderTop: `1px solid ${color}aa`,
                              borderBottom: `1px solid ${color}aa`,
                              borderLeft: continuesLeft ? "none" : `2px solid ${color}`,
                              borderRight: continuesRight ? "none" : `2px solid ${color}`,
                              borderRadius: 3,
                              color: color,
                            }}
                            title={`${sp.event.title}\n${fmtISODate(sp.event.start)} → ${fmtISODate(sp.event.end)}`}
                          >
                            {sp.event.isBirthday && <Gift size={10} className="shrink-0" />}
                            <span className="truncate">{sp.event.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right day detail */}
          <div className="w-72 shrink-0 border-l border-editor-border overflow-y-auto flex flex-col">
            <div className="px-4 py-3 border-b border-editor-border shrink-0">
              <div className="text-[10px] uppercase tracking-[0.14em] text-editor-muted select-none">
                Selected Day
              </div>
              <div className="text-sm font-medium text-editor-text mt-0.5">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </div>
              <div className="text-[11px] text-editor-muted">
                {fmtISODate(selectedDate)} · {selectedEvents.length}{" "}
                {selectedEvents.length === 1 ? "event" : "events"}
              </div>
            </div>
            <div className="flex-1 px-3 py-3 space-y-2">
              {selectedEvents.length === 0 ? (
                <div className="text-[11px] text-editor-muted/70 italic px-1 py-3">
                  No events on this day.
                </div>
              ) : (
                selectedEvents.map((ev) => (
                  <div
                    key={ev.line}
                    className="rounded-md border border-editor-border/60 bg-editor-overlay/20 px-3 py-2 group"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="shrink-0 mt-1 w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: ev.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          {ev.isBirthday && (
                            <Gift size={11} className="shrink-0 text-editor-mauve" />
                          )}
                          <div
                            className={`text-[12px] font-medium truncate ${
                              ev.state === "done"
                                ? "text-editor-green"
                                : ev.state === "cancelled"
                                ? "text-editor-muted line-through"
                                : "text-editor-text"
                            }`}
                          >
                            {ev.title}
                          </div>
                        </div>
                        <div className="text-[10px] text-editor-subtext mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px]"
                            style={{
                              backgroundColor: `${ev.color}22`,
                              color: ev.color,
                            }}
                          >
                            {ev.category}
                          </span>
                          {ev.isMultiDay ? (
                            <span>
                              {fmtISODate(ev.start)} → {fmtISODate(ev.end)}
                            </span>
                          ) : (
                            <span>
                              {fmtTime(ev.start)}
                              {!sameDay(ev.start, ev.end) || ev.start.getTime() !== ev.end.getTime()
                                ? ""
                                : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleJump(ev.line)}
                        className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-editor-border/50 transition-opacity"
                        title="Jump to task in editor"
                      >
                        <ExternalLink size={11} className="text-editor-subtext" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
