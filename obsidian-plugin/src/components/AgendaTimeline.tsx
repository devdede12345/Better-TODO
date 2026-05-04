import { useEffect, useMemo, useRef, useState } from "react";
import {
  Filter,
  Calendar,
  ChevronDown,
  ChevronUp,
  Check,
  Clock,
  ExternalLink,
  Play,
  MoreHorizontal,
  List,
  Crosshair,
} from "lucide-react";
import type { ParsedDocument, ParsedTask } from "../parser";

// ─── Types ──────────────────────────────────────────────────────────────────

type Slot = "completed" | "in-progress" | "planned" | "overdue" | "cancelled";
type Scale = "hour" | "day";

interface AgendaItem {
  task: ParsedTask;
  start: Date | null;
  end: Date | null;
  state: Slot;
  notes: string[];
}

interface AgendaTimelineProps {
  parsedDoc: ParsedDocument | null;
  content: string;
  onFocusLine: (line: number) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseTimestamp(str: string): Date | null {
  const t = str.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  m = t.match(/^(\d{2})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?$/);
  if (m) {
    const yy = +m[1];
    const fullYear = yy < 70 ? 2000 + yy : 1900 + yy;
    const d = new Date(fullYear, +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function extractTagValue(text: string, tag: string): string | null {
  const m = text.match(new RegExp(`@${tag}\\(([^)]+)\\)`));
  return m ? m[1].trim() : null;
}

function cleanText(text: string): string {
  return text
    .replace(/@[\w-]+\([^)]*\)/g, "")
    .replace(/@[\w-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lastedToMinutes(text: string): number | null {
  const v = extractTagValue(text, "lasted");
  if (!v) return null;
  let total = 0;
  const h = v.match(/(\d+)\s*h/);
  const m = v.match(/(\d+)\s*m/);
  if (h) total += parseInt(h[1], 10) * 60;
  if (m) total += parseInt(m[1], 10);
  return total || null;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtRange(start: Date | null, end: Date | null): string {
  if (start && end) return `${fmtClock(start)} – ${fmtClock(end)}`;
  if (start) return fmtClock(start);
  return "All day";
}

function fmtDuration(mins: number): string {
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ─── Build agenda items from parsed tasks ───────────────────────────────────

function buildAgenda(parsed: ParsedDocument | null, content: string, today: Date): AgendaItem[] {
  if (!parsed) return [];
  const lines = content.split("\n");
  const out: AgendaItem[] = [];

  for (const task of parsed.tasks) {
    const txt = lines[task.line] ?? task.text;

    const startedRaw = extractTagValue(txt, "started");
    const dueRaw = extractTagValue(txt, "due");
    const doneRaw = extractTagValue(txt, "done");
    const cancelledRaw = extractTagValue(txt, "cancelled");

    const startedAt = startedRaw ? parseTimestamp(startedRaw) : null;
    const dueAt = dueRaw ? parseTimestamp(dueRaw) : null;
    const doneAt = doneRaw ? parseTimestamp(doneRaw) : null;
    const cancelledAt = cancelledRaw ? parseTimestamp(cancelledRaw) : null;

    // Bind item to today only if any anchor falls on today
    const anchors = [startedAt, dueAt, doneAt, cancelledAt].filter(Boolean) as Date[];
    if (anchors.length === 0) continue;
    const onToday = anchors.some((d) => isSameDay(d, today));
    if (!onToday) continue;

    // Compute the displayed time range
    const start = startedAt ?? doneAt ?? dueAt;
    let end: Date | null = null;
    if (doneAt && startedAt) end = doneAt;
    else if (dueAt && startedAt) end = dueAt;
    else if (start) {
      const ms = lastedToMinutes(txt);
      end = ms ? new Date(start.getTime() + ms * 60_000) : new Date(start.getTime() + 30 * 60_000);
    }

    // Compute state
    let state: Slot = "planned";
    if (task.state === "done") state = "completed";
    else if (task.state === "cancelled") state = "cancelled";
    else if (startedAt && !doneAt) state = "in-progress";
    else if (dueAt && dueAt.getTime() < today.getTime()) state = "overdue";

    // Notes: child bullet lines (any non-task lines indented further than the task itself)
    const notes: string[] = [];
    for (let i = task.line + 1; i < lines.length; i++) {
      const raw = lines[i];
      if (raw.trim() === "") continue;
      const lineIndent = (raw.match(/^(\s*)/)?.[1] ?? "").length;
      const taskIndent = (lines[task.line].match(/^(\s*)/)?.[1] ?? "").length;
      if (lineIndent <= taskIndent) break;
      // skip nested tasks – those become their own agenda items
      if (/^[ \t]*([☐✔✘]|(?:[-*+]|\d+\.)\s+\[[ xX/\-]\])/.test(raw)) continue;
      notes.push(raw.trim().replace(/^[-*+]\s+/, ""));
    }

    out.push({ task: { ...task, text: cleanText(task.text) }, start, end, state, notes });
  }

  // Sort by start time (items without time go first as "all day")
  out.sort((a, b) => {
    if (!a.start && !b.start) return 0;
    if (!a.start) return -1;
    if (!b.start) return 1;
    return a.start.getTime() - b.start.getTime();
  });

  return out;
}

// ─── Status pill ────────────────────────────────────────────────────────────

const STATE_META: Record<Slot, { label: string; dotClass: string; pillClass: string }> = {
  completed: {
    label: "Completed",
    dotClass: "bg-emerald-400",
    pillClass: "bg-emerald-400/15 text-emerald-300",
  },
  "in-progress": {
    label: "In progress",
    dotClass: "bg-violet-400",
    pillClass: "bg-violet-400/20 text-violet-300",
  },
  planned: {
    label: "Planned",
    dotClass: "bg-slate-400",
    pillClass: "bg-slate-400/15 text-slate-300",
  },
  overdue: {
    label: "Overdue",
    dotClass: "bg-rose-400",
    pillClass: "bg-rose-400/20 text-rose-300",
  },
  cancelled: {
    label: "Cancelled",
    dotClass: "bg-zinc-500",
    pillClass: "bg-zinc-500/20 text-zinc-400 line-through",
  },
};

function StatusPill({ state }: { state: Slot }) {
  const meta = STATE_META[state];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-[1px] text-[10px] font-medium ${meta.pillClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  );
}

// ─── Now indicator helper ───────────────────────────────────────────────────

function useNowTick(intervalMs = 60_000): Date {
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AgendaTimeline({ parsedDoc, content, onFocusLine }: AgendaTimelineProps) {
  const now = useNowTick();
  const today = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);

  const items = useMemo(
    () => buildAgenda(parsedDoc, content, today),
    [parsedDoc, content, today]
  );

  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const selected = useMemo(
    () => items.find((it) => it.task.line === selectedLine) ?? null,
    [items, selectedLine]
  );

  const [scale, setScale] = useState<Scale>("hour");
  const [pastOpen, setPastOpen] = useState(true);
  const [futureOpen, setFutureOpen] = useState(true);

  const past = items.filter(
    (it) => it.start && it.start.getTime() <= now.getTime() && it.state !== "completed"
      ? false
      : it.start && it.end && it.end.getTime() < now.getTime()
  );
  const current = items.filter(
    (it) =>
      it.start &&
      it.end &&
      it.start.getTime() <= now.getTime() &&
      it.end.getTime() > now.getTime()
  );
  const future = items.filter((it) => it.start && it.start.getTime() > now.getTime());
  const allDay = items.filter((it) => !it.start);

  // Stats
  const totalTasks = items.length;
  const focusMins = items.reduce((acc, it) => {
    if (it.start && it.end) return acc + Math.max(0, (it.end.getTime() - it.start.getTime()) / 60_000);
    const ls = lastedToMinutes((parsedDoc && content.split("\n")[it.task.line]) ?? "");
    return acc + (ls ?? 0);
  }, 0);
  const overdueCount = items.filter((it) => it.state === "overdue").length;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Auto-scroll to NOW row on first render
  useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-now-marker]") as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "center", behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayLabel = useMemo(() => {
    const d = new Date(today);
    const sameDay = isSameDay(d, new Date());
    if (sameDay) return "Today";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }, [today]);

  return (
    <div className="btodo-root flex h-full w-full flex-col bg-[rgb(var(--btodo-editor-bg))] text-[rgb(var(--btodo-editor-text))]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-4 pt-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[22px] font-semibold leading-tight">{dayLabel}</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-[2px] text-[10px] font-semibold text-violet-300">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              NOW
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn title="Filter"><Filter size={14} /></IconBtn>
          <IconBtn title="Pick day"><Calendar size={14} /></IconBtn>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1 px-4 pb-3 text-center">
        <Stat label="Tasks" value={String(totalTasks)} />
        <Stat label="Focus Time" value={fmtDuration(Math.round(focusMins))} />
        <Stat label="Overdue" value={String(overdueCount)} />
      </div>

      <div className="h-px w-full bg-white/5" />

      {/* ── Scrollable agenda ──────────────────────────────────────────── */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {allDay.length > 0 && (
          <div className="mb-2 space-y-1">
            <div className="px-1 text-[10px] uppercase tracking-wider text-white/40">All day</div>
            {allDay.map((it) => (
              <TaskCard
                key={it.task.line}
                item={it}
                selected={selected?.task.line === it.task.line}
                onSelect={() => setSelectedLine(it.task.line)}
              />
            ))}
          </div>
        )}

        {past.length > 0 && (
          <Collapsible label="Past" open={pastOpen} onToggle={() => setPastOpen((p) => !p)}>
            {past.map((it) => (
              <TimeRow
                key={it.task.line}
                item={it}
                selected={selected?.task.line === it.task.line}
                onSelect={() => setSelectedLine(it.task.line)}
              />
            ))}
          </Collapsible>
        )}

        {/* NOW marker / current items */}
        <div data-now-marker className="relative my-2 flex items-center gap-2">
          <span className="w-12 shrink-0 text-right text-[11px] font-semibold text-violet-300">
            {fmtClock(now)}
          </span>
          <div className="relative flex-1">
            <div className="absolute left-0 right-0 top-1/2 h-px bg-violet-400/60" />
            <div className="relative ml-[-6px] inline-block h-3 w-3 rounded-full bg-violet-400 shadow-[0_0_0_4px_rgba(139,92,246,0.25)]" />
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
              Now
            </span>
          </div>
        </div>

        {current.map((it) => (
          <TimeRow
            key={it.task.line}
            item={it}
            selected={selected?.task.line === it.task.line}
            onSelect={() => setSelectedLine(it.task.line)}
            highlight
          />
        ))}

        {future.length > 0 && (
          <Collapsible label="Future" open={futureOpen} onToggle={() => setFutureOpen((p) => !p)}>
            {future.map((it) => (
              <TimeRow
                key={it.task.line}
                item={it}
                selected={selected?.task.line === it.task.line}
                onSelect={() => setSelectedLine(it.task.line)}
              />
            ))}
          </Collapsible>
        )}

        {items.length === 0 && (
          <div className="px-2 py-8 text-center text-xs text-white/40">
            No tasks scheduled for {dayLabel.toLowerCase()}.
            <br />
            Add <code className="font-mono text-[11px]">@due(YYYY-MM-DD HH:mm)</code> or{" "}
            <code className="font-mono text-[11px]">@started(...)</code> to a task to see it here.
          </div>
        )}
      </div>

      {/* ── Detail panel ──────────────────────────────────────────────── */}
      {selected && (
        <DetailPanel
          item={selected}
          onOpen={() => onFocusLine(selected.task.line)}
          onClose={() => setSelectedLine(null)}
        />
      )}

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-white/5 px-3 py-2 text-[10px] text-white/50">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wider">Time scale</span>
          <div className="flex overflow-hidden rounded border border-white/10">
            {(["hour", "day"] as Scale[]).map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`px-2 py-[2px] capitalize ${
                  scale === s ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wider">View</span>
          <IconBtn title="Center on now"><Crosshair size={12} /></IconBtn>
          <IconBtn title="List view"><List size={12} /></IconBtn>
        </div>
      </div>

      <Legend />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function IconBtn({
  title,
  children,
  onClick,
}: { title: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md py-1">
      <div className="text-lg font-semibold leading-tight">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}

function Collapsible({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="my-1">
      <button
        onClick={onToggle}
        className="mx-auto mb-1 flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-[2px] text-[10px] uppercase tracking-wider text-white/60 hover:bg-white/10"
      >
        {label}
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {open && <div className="space-y-1">{children}</div>}
    </div>
  );
}

function TimeRow({
  item,
  selected,
  onSelect,
  highlight,
}: {
  item: AgendaItem;
  selected: boolean;
  onSelect: () => void;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="w-12 shrink-0 pt-2 text-right text-[11px] tabular-nums text-white/50">
        {item.start ? fmtClock(item.start) : ""}
      </div>
      <div className="relative flex w-3 shrink-0 justify-center">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10" />
        <span
          className={`relative z-10 mt-2 h-3 w-3 rounded-full border-2 ${
            item.state === "completed"
              ? "border-emerald-400 bg-emerald-400/30"
              : item.state === "in-progress"
              ? "border-violet-400 bg-violet-400"
              : item.state === "overdue"
              ? "border-rose-400 bg-rose-400/30"
              : "border-white/30 bg-transparent"
          }`}
        />
      </div>
      <div className="flex-1 pb-1">
        <TaskCard item={item} selected={selected} onSelect={onSelect} highlight={highlight} />
      </div>
    </div>
  );
}

function TaskCard({
  item,
  selected,
  onSelect,
  highlight,
}: {
  item: AgendaItem;
  selected: boolean;
  onSelect: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`block w-full rounded-lg border px-3 py-2 text-left transition ${
        selected
          ? "border-violet-400/60 bg-violet-400/10"
          : highlight
          ? "border-violet-400/40 bg-white/5"
          : "border-white/10 bg-white/[0.03] hover:bg-white/5"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{item.task.text}</div>
          <div className="mt-[2px] text-[11px] tabular-nums text-white/55">
            {fmtRange(item.start, item.end)}
          </div>
        </div>
        {item.state === "completed" && <Check size={14} className="mt-1 text-emerald-300" />}
      </div>
      <div className="mt-1.5">
        <StatusPill state={item.state} />
      </div>
    </button>
  );
}

function DetailPanel({
  item,
  onOpen,
  onClose,
}: {
  item: AgendaItem;
  onOpen: () => void;
  onClose: () => void;
}) {
  const durMin =
    item.start && item.end ? Math.round((item.end.getTime() - item.start.getTime()) / 60_000) : 0;

  return (
    <div className="border-t border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold leading-tight text-white">{item.task.text}</h3>
        <button
          onClick={onClose}
          className="text-xs text-white/40 hover:text-white"
          title="Close detail"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-white/60">
        <Clock size={12} />
        <span className="tabular-nums">
          {fmtRange(item.start, item.end)} {durMin > 0 && `(${fmtDuration(durMin)})`}
        </span>
        <StatusPill state={item.state} />
      </div>
      {item.notes.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-white/40">Notes</div>
          <ul className="mt-1 list-disc space-y-[2px] pl-4 text-[12px] text-white/75">
            {item.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex items-center gap-1">
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
        >
          <ExternalLink size={12} /> Open in note
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
          title="(coming soon)"
        >
          <Play size={12} /> Start focus
        </button>
        <button
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
          title="More"
        >
          <MoreHorizontal size={12} />
        </button>
      </div>
    </div>
  );
}

function Legend() {
  const items: { state: Slot; label: string }[] = [
    { state: "completed", label: "Completed" },
    { state: "in-progress", label: "In progress" },
    { state: "planned", label: "Planned" },
    { state: "overdue", label: "Overdue" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t border-white/5 px-3 py-2 text-[10px] text-white/50">
      {items.map((it) => (
        <span key={it.state} className="inline-flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${STATE_META[it.state].dotClass}`} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
