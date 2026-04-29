// Better TODO parser — supports both `.todo` syntax (☐ ✔ ✘) and Markdown
// task lists (- [ ], - [x], - [-]).
//
// Largely ported from src/editor/todoParser.ts of the standalone app, with
// added Markdown detection. Keeps the same ParsedDocument / ParsedProject /
// ParsedTask shapes so the existing TimelineView can be reused as-is.

// ─── Regex Patterns ──────────────────────────────────────────────────────────

const RE_PROJECT = /^(\s*)(.*?):\s*(@.*)?$/;

// .todo glyphs
const RE_TODO_PENDING = /^(\s*)☐\s+(.*)/;
const RE_TODO_DONE = /^(\s*)✔\s+(.*)/;
const RE_TODO_CANCELLED = /^(\s*)✘\s+(.*)/;

// Markdown task lists (also handles "+", "1.", "- [/]" half-done variants)
// Captures: indent, marker char, text
const RE_MD_TASK = /^(\s*)(?:[-*+]|\d+\.)\s+\[([ xX/\-])\]\s+(.*)/;

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskState = "pending" | "done" | "cancelled";

export interface ParsedTask {
  line: number;
  indent: number;
  state: TaskState;
  text: string;
  tags: string[];
  estMinutes: number;
}

export interface ProjectStats {
  pending: number;
  done: number;
  cancelled: number;
  total: number;
  estMinutes: number;
}

export interface ParsedProject {
  line: number;
  indent: number;
  name: string;
  tags: string[];
  stats: ProjectStats;
  children: (ParsedTask | ParsedProject)[];
}

export interface ParsedDocument {
  projects: ParsedProject[];
  tasks: ParsedTask[];
  globalStats: ProjectStats;
}

// ─── Time Parsing ────────────────────────────────────────────────────────────

export function parseTimeToMinutes(input: string): number {
  let minutes = 0;
  const trimmed = input.trim().toLowerCase();

  const dayMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:days?|d)/);
  const hourMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:hours?|h)/);
  const minMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)(?!o)/);

  if (dayMatch) minutes += parseFloat(dayMatch[1]) * 8 * 60;
  if (hourMatch) minutes += parseFloat(hourMatch[1]) * 60;
  if (minMatch) minutes += parseFloat(minMatch[1]);

  if (minutes === 0) {
    const compact = trimmed.match(/^(\d+(?:\.\d+)?)h(?:(\d+)m)?$/);
    if (compact) {
      minutes += parseFloat(compact[1]) * 60;
      if (compact[2]) minutes += parseInt(compact[2], 10);
    }
    const compactMin = trimmed.match(/^(\d+)m$/);
    if (compactMin) minutes += parseInt(compactMin[1], 10);
  }

  return minutes;
}

export function formatMinutes(total: number): string {
  if (total <= 0) return "";
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ─── Tag Extraction ──────────────────────────────────────────────────────────

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const re = /@([\w-]+)(?:\([^)]*\))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) tags.push(match[1]);
  return tags;
}

function extractEstMinutes(text: string): number {
  let total = 0;
  const estTagRe = /@est\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = estTagRe.exec(text)) !== null) total += parseTimeToMinutes(m[1]);
  const shortRe = /@(\d+(?:\.\d+)?(?:h|m|d)(?:\d+m?)?)\b/g;
  while ((m = shortRe.exec(text)) !== null) {
    const prefix = text.slice(0, m.index);
    if (prefix.endsWith("est(")) continue;
    total += parseTimeToMinutes(m[1]);
  }
  return total;
}

// ─── Indentation Helper ──────────────────────────────────────────────────────

function indentLevel(line: string, tabSize: number = 2): number {
  const match = line.match(/^(\s*)/);
  if (!match) return 0;
  const spaces = match[1].replace(/\t/g, " ".repeat(tabSize));
  return Math.floor(spaces.length / tabSize);
}

// ─── Markdown task marker → state ────────────────────────────────────────────

function mdMarkerToState(ch: string): TaskState {
  if (ch === "x" || ch === "X") return "done";
  if (ch === "-" || ch === "/") return "cancelled";
  return "pending";
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

export function parseTodoDocument(text: string): ParsedDocument {
  const lines = text.split("\n");
  const allTasks: ParsedTask[] = [];
  const rootProjects: ParsedProject[] = [];

  const projectStack: ParsedProject[] = [];

  function currentProject(): ParsedProject | null {
    return projectStack.length > 0 ? projectStack[projectStack.length - 1] : null;
  }

  function addTaskToNearestProject(task: ParsedTask) {
    while (
      projectStack.length > 0 &&
      projectStack[projectStack.length - 1].indent >= task.indent
    ) {
      projectStack.pop();
    }
    const parent = currentProject();
    if (parent) parent.children.push(task);
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const indent = indentLevel(raw);

    // ── Project header (e.g. "Inbox:" or "## Heading" — Markdown headings
    //    are not treated as projects here; users can mimic project headers
    //    with bare "Name:" lines.)
    const projMatch = raw.match(RE_PROJECT);
    const isMdTask = RE_MD_TASK.test(raw);
    const isTodoTask =
      RE_TODO_PENDING.test(raw) ||
      RE_TODO_DONE.test(raw) ||
      RE_TODO_CANCELLED.test(raw);
    if (
      projMatch &&
      raw.trim().length > 1 &&
      raw.trimEnd().endsWith(":") &&
      !isMdTask &&
      !isTodoTask
    ) {
      while (
        projectStack.length > 0 &&
        projectStack[projectStack.length - 1].indent >= indent
      ) {
        projectStack.pop();
      }

      const projName = projMatch[2].trim();
      const projTags = projMatch[3] ? extractTags(projMatch[3]) : [];

      const project: ParsedProject = {
        line: i,
        indent,
        name: projName,
        tags: projTags,
        stats: { pending: 0, done: 0, cancelled: 0, total: 0, estMinutes: 0 },
        children: [],
      };

      const parent = currentProject();
      if (parent) parent.children.push(project);
      else rootProjects.push(project);

      projectStack.push(project);
      continue;
    }

    // ── Task detection (try .todo glyphs first, then Markdown checkbox)
    let state: TaskState | null = null;
    let taskText = "";

    let m = raw.match(RE_TODO_PENDING);
    if (m) {
      state = "pending";
      taskText = m[2];
    } else if ((m = raw.match(RE_TODO_DONE))) {
      state = "done";
      taskText = m[2];
    } else if ((m = raw.match(RE_TODO_CANCELLED))) {
      state = "cancelled";
      taskText = m[2];
    } else if ((m = raw.match(RE_MD_TASK))) {
      state = mdMarkerToState(m[2]);
      taskText = m[3];
    }

    if (state !== null) {
      const task: ParsedTask = {
        line: i,
        indent,
        state,
        text: taskText,
        tags: extractTags(taskText),
        estMinutes: extractEstMinutes(taskText),
      };
      allTasks.push(task);
      addTaskToNearestProject(task);
    }
  }

  // ── Compute stats ──────────────────────────────────────────────────────────
  function computeProjectStats(project: ParsedProject): ProjectStats {
    const stats: ProjectStats = {
      pending: 0, done: 0, cancelled: 0, total: 0, estMinutes: 0,
    };
    for (const child of project.children) {
      if ("state" in child) {
        stats.total++;
        if (child.state === "pending") {
          stats.pending++;
          stats.estMinutes += child.estMinutes;
        } else if (child.state === "done") stats.done++;
        else stats.cancelled++;
      } else {
        const childStats = computeProjectStats(child);
        stats.pending += childStats.pending;
        stats.done += childStats.done;
        stats.cancelled += childStats.cancelled;
        stats.total += childStats.total;
        stats.estMinutes += childStats.estMinutes;
      }
    }
    project.stats = stats;
    return stats;
  }

  const globalStats: ProjectStats = {
    pending: 0, done: 0, cancelled: 0, total: 0, estMinutes: 0,
  };

  for (const proj of rootProjects) {
    const s = computeProjectStats(proj);
    globalStats.pending += s.pending;
    globalStats.done += s.done;
    globalStats.cancelled += s.cancelled;
    globalStats.total += s.total;
    globalStats.estMinutes += s.estMinutes;
  }

  const projectTaskLines = new Set<number>();
  function collectProjectTaskLines(proj: ParsedProject) {
    for (const child of proj.children) {
      if ("state" in child) projectTaskLines.add(child.line);
      else collectProjectTaskLines(child);
    }
  }
  for (const proj of rootProjects) collectProjectTaskLines(proj);

  for (const task of allTasks) {
    if (!projectTaskLines.has(task.line)) {
      globalStats.total++;
      if (task.state === "pending") {
        globalStats.pending++;
        globalStats.estMinutes += task.estMinutes;
      } else if (task.state === "done") globalStats.done++;
      else globalStats.cancelled++;
    }
  }

  return { projects: rootProjects, tasks: allTasks, globalStats };
}
