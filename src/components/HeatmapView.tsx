import { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, Flame, Check, Play } from "lucide-react";
import type { ParsedDocument } from "../editor/todoParser";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskActivity {
  line: number;
  text: string;
  type: "done" | "started";
}

interface DayData {
  date: string;
  count: number;
  doneCount: number;
  startedCount: number;
  activities: TaskActivity[];
}

interface HeatmapViewProps {
  parsedDoc: ParsedDocument | null;
  content: string;
  onClose: () => void;
  onFocusLine: (lineIndex: number) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CELL_SIZE = 12;
const CELL_GAP = 2;
const CELL_STEP = CELL_SIZE + CELL_GAP;

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    const d = new Date(yy < 70 ? 2000 + yy : 1900 + yy, +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

function cleanTaskText(text: string): string {
  return text.replace(/@[\w-]+\([^)]*\)/g, "").replace(/@[\w-]+/g, "").replace(/\s+/g, " ").trim();
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

function buildActivityMap(doc: ParsedDocument | null): Map<string, DayData> {
  if (!doc) return new Map();
  const map = new Map<string, DayData>();

  const add = (date: Date, activity: TaskActivity) => {
    const key = toDateKey(date);
    if (!map.has(key)) map.set(key, { date: key, count: 0, doneCount: 0, startedCount: 0, activities: [] });
    const d = map.get(key)!;
    d.count++;
    if (activity.type === "done") d.doneCount++;
    else d.startedCount++;
    d.activities.push(activity);
  };

  for (const t of doc.tasks) {
    const raw = t.text;
    const text = cleanTaskText(raw) || "(untitled)";

    const doneM = raw.match(/@done\(([^)]+)\)/);
    if (doneM) {
      const d = parseTimestamp(doneM[1]);
      if (d) add(d, { line: t.line, text, type: "done" });
    }

    const startM = raw.match(/@start(?:ed)?\(([^)]+)\)/);
    if (startM) {
      const d = parseTimestamp(startM[1]);
      if (d) add(d, { line: t.line, text, type: "started" });
    }
  }

  return map;
}

function calcStreak(map: Map<string, DayData>): { current: number; longest: number } {
  if (map.size === 0) return { current: 0, longest: 0 };

  const dates = Array.from(map.keys()).sort();

  // Longest consecutive run
  let longest = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const diffDays = Math.round((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
    if (diffDays === 1) {
      longest = Math.max(longest, ++run);
    } else {
      run = 1;
    }
  }

  // Current streak going backwards from today (or yesterday)
  let current = 0;
  let checkDate: Date | null = map.has(toDateKey(new Date()))
    ? new Date()
    : map.has(toDateKey(new Date(Date.now() - 86400000)))
    ? new Date(Date.now() - 86400000)
    : null;
  while (checkDate && map.has(toDateKey(checkDate))) {
    current++;
    checkDate = new Date(checkDate.getTime() - 86400000);
  }

  return { current, longest };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HeatmapView({ parsedDoc, onClose, onFocusLine }: HeatmapViewProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);

  const isDark = document.documentElement.classList.contains("theme-dark");
  const HEAT_COLORS = isDark
    ? ["rgba(255,255,255,0.07)", "#0e4429", "#006d32", "#26a641", "#39d353"]
    : ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

  // Darken title bar overlay on Windows while open
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

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const activityMap = useMemo(() => buildActivityMap(parsedDoc), [parsedDoc]);

  // Build the year grid
  const { weeks, monthLabels } = useMemo(() => {
    const jan1 = new Date(year, 0, 1);
    const startDow = jan1.getDay();
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInYear = isLeap ? 366 : 365;
    const numWeeks = Math.ceil((startDow + daysInYear) / 7);

    const weeks: (string | null)[][] = Array.from({ length: numWeeks }, () => Array(7).fill(null));
    for (let day = 0; day < daysInYear; day++) {
      const date = new Date(year, 0, day + 1);
      const cellIdx = startDow + day;
      weeks[Math.floor(cellIdx / 7)][cellIdx % 7] = toDateKey(date);
    }

    // Month label positions
    const monthLabels: { month: number; weekIdx: number }[] = [];
    let lastMonth = -1;
    for (let wi = 0; wi < weeks.length; wi++) {
      for (const dateStr of weeks[wi]) {
        if (dateStr) {
          const month = parseInt(dateStr.split("-")[1], 10) - 1;
          if (month !== lastMonth) {
            monthLabels.push({ month, weekIdx: wi });
            lastMonth = month;
          }
          break;
        }
      }
    }

    return { weeks, monthLabels };
  }, [year]);

  // Per-year stats
  const { yearTotal, yearDone, yearStarted, busiestDay, streak } = useMemo(() => {
    let yearTotal = 0;
    let yearDone = 0;
    let yearStarted = 0;
    let busiestDay: DayData | null = null;

    for (const [, data] of activityMap) {
      if (!data.date.startsWith(String(year))) continue;
      yearTotal += data.count;
      yearDone += data.doneCount;
      yearStarted += data.startedCount;
      if (!busiestDay || data.count > busiestDay.count) busiestDay = data;
    }

    const streak = calcStreak(activityMap);
    return { yearTotal, yearDone, yearStarted, busiestDay, streak };
  }, [activityMap, year]);

  return (
    <div
      className={`fixed inset-0 z-[200] bg-black/60 flex items-center justify-center px-10 pb-8 ${isMac ? "pt-6" : "pt-10"}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-editor-bg border border-editor-border rounded-xl shadow-2xl flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-editor-border shrink-0">
          <div className="flex items-center gap-2">
            <Flame size={16} className="text-editor-accent" />
            <h2 className="text-sm font-medium text-editor-text">Activity Heatmap</h2>
            <span className="text-[11px] text-editor-muted ml-2">
              {yearTotal} activities in {year}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Year nav */}
            <div className="flex items-center bg-editor-overlay/50 rounded-md">
              <button
                onClick={() => setYear((y) => y - 1)}
                className="p-1.5 rounded-l-md hover:bg-editor-border transition-colors"
              >
                <ChevronLeft size={13} className="text-editor-subtext" />
              </button>
              <span className="text-[12px] text-editor-text px-2 font-mono tabular-nums">{year}</span>
              <button
                onClick={() => setYear((y) => y + 1)}
                disabled={year >= currentYear}
                className="p-1.5 rounded-r-md hover:bg-editor-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={13} className="text-editor-subtext" />
              </button>
            </div>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-editor-border transition-colors">
              <X size={14} className="text-editor-subtext" />
            </button>
          </div>
        </div>

        {/* ── Heatmap grid ── */}
        <div className="px-6 pt-4 pb-3 overflow-x-auto">
          {/* Month labels */}
          <div className="flex mb-1.5" style={{ paddingLeft: 30 }}>
            {monthLabels.map(({ month, weekIdx }, i) => {
              const nextWeekIdx = i + 1 < monthLabels.length ? monthLabels[i + 1].weekIdx : weeks.length;
              const widthPx = (nextWeekIdx - weekIdx) * CELL_STEP;
              return (
                <div
                  key={month}
                  className="text-[10px] text-editor-muted shrink-0 select-none"
                  style={{ width: widthPx }}
                >
                  {MONTHS[month]}
                </div>
              );
            })}
          </div>

          {/* Grid: day labels + week columns */}
          <div className="flex" style={{ gap: 0 }}>
            {/* Day of week labels — only Mon / Wed / Fri */}
            <div className="flex flex-col mr-1.5 select-none" style={{ gap: CELL_GAP }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                <div
                  key={day}
                  className="text-[9px] text-editor-muted flex items-center justify-end pr-1"
                  style={{ height: CELL_SIZE, width: 28 }}
                >
                  {i % 2 === 1 ? day : ""}
                </div>
              ))}
            </div>

            {/* Week columns */}
            <div className="flex" style={{ gap: CELL_GAP }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: CELL_GAP }}>
                  {week.map((dateStr, di) => {
                    if (!dateStr) {
                      return <div key={di} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
                    }
                    const data = activityMap.get(dateStr);
                    const count = data?.count ?? 0;
                    const color = HEAT_COLORS[getLevel(count)];
                    const isToday = dateStr === toDateKey(new Date());

                    return (
                      <div
                        key={di}
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          backgroundColor: color,
                          borderRadius: 2,
                          outline: isToday ? "1.5px solid #63b3ed" : undefined,
                          outlineOffset: 1,
                          cursor: count > 0 ? "pointer" : "default",
                          transition: "opacity 0.1s",
                        }}
                        onMouseEnter={() =>
                          setHoveredDay(data ?? { date: dateStr, count: 0, doneCount: 0, startedCount: 0, activities: [] })
                        }
                        onMouseLeave={() => setHoveredDay(null)}
                        onClick={() => {
                          if (data?.activities[0]) {
                            onFocusLine(data.activities[0].line);
                            onClose();
                          }
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1.5 mt-3 justify-end select-none">
            <span className="text-[10px] text-editor-muted mr-0.5">Less</span>
            {HEAT_COLORS.map((color, i) => (
              <div
                key={i}
                style={{ width: CELL_SIZE, height: CELL_SIZE, backgroundColor: color, borderRadius: 2 }}
              />
            ))}
            <span className="text-[10px] text-editor-muted ml-0.5">More</span>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="px-6 py-2.5 border-t border-editor-border/60 grid grid-cols-4 gap-4">
          <StatCard
            icon={<Check size={11} />}
            label="Completed"
            value={yearDone}
            color="text-editor-green"
          />
          <StatCard
            icon={<Play size={11} />}
            label="Started"
            value={yearStarted}
            color="text-editor-yellow"
          />
          <StatCard
            icon={<Flame size={11} />}
            label="Current streak"
            value={streak.current}
            suffix="days"
            color="text-editor-accent"
          />
          <StatCard
            icon={<Flame size={11} />}
            label="Longest streak"
            value={streak.longest}
            suffix="days"
            color="text-editor-subtext"
          />
        </div>

        {/* ── Footer: hover detail ── */}
        <div className="border-t border-editor-border px-5 py-2 min-h-[36px] flex items-center text-[11px]">
          {hoveredDay && hoveredDay.count > 0 ? (
            <div className="flex items-center gap-3 w-full overflow-hidden">
              <span className="text-editor-text font-medium shrink-0">{hoveredDay.date}</span>
              <span className="text-editor-accent shrink-0">{hoveredDay.count} activities</span>
              {hoveredDay.doneCount > 0 && (
                <span className="text-editor-green shrink-0">✓ {hoveredDay.doneCount} done</span>
              )}
              {hoveredDay.startedCount > 0 && (
                <span className="text-editor-yellow shrink-0">▶ {hoveredDay.startedCount} started</span>
              )}
              <span className="text-editor-muted truncate">
                {hoveredDay.activities.slice(0, 3).map((a) => a.text).join(" · ")}
                {hoveredDay.activities.length > 3 && ` · +${hoveredDay.activities.length - 3} more`}
              </span>
            </div>
          ) : hoveredDay ? (
            <span className="text-editor-muted">{hoveredDay.date} · No activity</span>
          ) : busiestDay ? (
            <span className="text-editor-muted">
              Busiest day:{" "}
              <span className="text-editor-text">{busiestDay.date}</span>
              {" "}({busiestDay.count} activities) · Hover a cell for details ·{" "}
              <kbd className="text-editor-subtext">Esc</kbd> to close
            </span>
          ) : (
            <span className="text-editor-muted">
              No activity data found — add <code className="text-editor-accent mx-1">@done(...)</code> or{" "}
              <code className="text-editor-accent mr-1">@started(...)</code> to tasks
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StatCard sub-component ───────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  suffix,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className={`flex items-center gap-1 text-[10px] ${color} uppercase tracking-wide`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-[18px] font-semibold text-editor-text tabular-nums leading-tight">
        {value}
        {suffix && <span className="text-[11px] text-editor-muted ml-1 font-normal">{suffix}</span>}
      </div>
    </div>
  );
}
