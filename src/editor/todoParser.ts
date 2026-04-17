// ─── Regex Patterns ──────────────────────────────────────────────────────────

const RE_PROJECT = /^(\s*)(.*?):\s*(@.*)?$/;
const RE_TASK_PENDING = /^(\s*)☐\s+(.*)/;
const RE_TASK_DONE = /^(\s*)✔\s+(.*)/;
const RE_TASK_CANCELLED = /^(\s*)✘\s+(.*)/;
const RE_EST_TAG = /@est\(([^)]+)\)|@(\d+(?:\.\d+)?(?:h|m|d)(?:\d+(?:m))?)/g;
const RE_PLAIN_TEXT = /^(\s+)(?!☐|✔|✘)(.+)/;

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskState = "pending" | "done" | "cancelled";

export interface ParsedTask {
  line: number;           // 0-indexed line number
  indent: number;         // indentation level (number of leading spaces / 2)
  state: TaskState;
  text: string;           // raw task text after the marker
  tags: string[];         // all @tag names found on this line
  estMinutes: number;     // parsed @est value in minutes, 0 if absent
}

export interface ProjectStats {
  pending: number;
  done: number;
  cancelled: number;
  total: number;
  estMinutes: number;     // sum of @est for pending tasks in this project
}

export interface ParsedProject {
  line: number;           // 0-indexed line number
  indent: number;
  name: string;
  tags: string[];         // project-level tags like @high
  stats: ProjectStats;
  children: (ParsedTask | ParsedProject)[];
}

export interface ParsedDocument {
  projects: ParsedProject[];
  tasks: ParsedTask[];         // all tasks (flat list)
  globalStats: ProjectStats;   // aggregated stats for the whole document
}

// ─── Time Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a human-readable time string into minutes.
 * Supports: "1h30m", "2h", "45m", "1 day and 20 minutes", "1d", "1.5h", etc.
 */
export function parseTimeToMinutes(input: string): number {
  let minutes = 0;
  const trimmed = input.trim().toLowerCase();

  // Natural language: "1 day and 20 minutes", "2 hours", "30 minutes"
  const dayMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:days?|d)/);
  const hourMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:hours?|h)/);
  const minMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)(?!o)/); // avoid "months"

  if (dayMatch) minutes += parseFloat(dayMatch[1]) * 8 * 60; // 1 work-day = 8h
  if (hourMatch) minutes += parseFloat(hourMatch[1]) * 60;
  if (minMatch) minutes += parseFloat(minMatch[1]);

  // Compact form: "1h30m", "2h", "45m"
  if (minutes === 0) {
    const compact = trimmed.match(/^(\d+(?:\.\d+)?)h(?:(\d+)m)?$/);
    if (compact) {
      minutes += parseFloat(compact[1]) * 60;
      if (compact[2]) minutes += parseInt(compact[2], 10);
    }
    const compactMin = trimmed.match(/^(\d+)m$/);
    if (compactMin) {
      minutes += parseInt(compactMin[1], 10);
    }
  }

  return minutes;
}

/**
 * Format minutes into a compact human-readable string.
 */
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
  while ((match = re.exec(text)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}

function extractEstMinutes(text: string): number {
  let total = 0;
  // @est(...)
  const estTagRe = /@est\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = estTagRe.exec(text)) !== null) {
    total += parseTimeToMinutes(m[1]);
  }
  // Shorthand: @1h30m, @2h, @45m (standalone time tags)
  const shortRe = /@(\d+(?:\.\d+)?(?:h|m|d)(?:\d+m?)?)\b/g;
  while ((m = shortRe.exec(text)) !== null) {
    // Skip if this is part of @est(...) — already counted
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

// ─── Main Parser ─────────────────────────────────────────────────────────────

export function parseTodoDocument(text: string): ParsedDocument {
  const lines = text.split("\n");
  const allTasks: ParsedTask[] = [];
  const rootProjects: ParsedProject[] = [];

  // Stack to track nested project hierarchy
  const projectStack: ParsedProject[] = [];

  function currentProject(): ParsedProject | null {
    return projectStack.length > 0 ? projectStack[projectStack.length - 1] : null;
  }

  function addTaskToNearestProject(task: ParsedTask) {
    // Walk up the stack to find a project at a lower indent level
    while (projectStack.length > 0 && projectStack[projectStack.length - 1].indent >= task.indent) {
      projectStack.pop();
    }
    const parent = currentProject();
    if (parent) {
      parent.children.push(task);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const indent = indentLevel(raw);

    // ── Check for Project ──
    const projMatch = raw.match(RE_PROJECT);
    if (projMatch && raw.trim().length > 1 && raw.trimEnd().endsWith(":")) {
      // Pop projects at the same or deeper indentation
      while (projectStack.length > 0 && projectStack[projectStack.length - 1].indent >= indent) {
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
      if (parent) {
        parent.children.push(project);
      } else {
        rootProjects.push(project);
      }

      projectStack.push(project);
      continue;
    }

    // ── Check for Task ──
    let taskMatch = raw.match(RE_TASK_PENDING);
    let state: TaskState | null = null;
    let taskText = "";

    if (taskMatch) {
      state = "pending";
      taskText = taskMatch[2];
    } else {
      taskMatch = raw.match(RE_TASK_DONE);
      if (taskMatch) {
        state = "done";
        taskText = taskMatch[2];
      } else {
        taskMatch = raw.match(RE_TASK_CANCELLED);
        if (taskMatch) {
          state = "cancelled";
          taskText = taskMatch[2];
        }
      }
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

  // ── Compute Stats ──────────────────────────────────────────────────────────
  // Recursively compute stats for each project from its children
  function computeProjectStats(project: ParsedProject): ProjectStats {
    const stats: ProjectStats = { pending: 0, done: 0, cancelled: 0, total: 0, estMinutes: 0 };

    for (const child of project.children) {
      if ("state" in child) {
        // It's a task
        stats.total++;
        if (child.state === "pending") {
          stats.pending++;
          stats.estMinutes += child.estMinutes;
        } else if (child.state === "done") {
          stats.done++;
        } else {
          stats.cancelled++;
        }
      } else {
        // It's a nested project — recurse
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

  const globalStats: ProjectStats = { pending: 0, done: 0, cancelled: 0, total: 0, estMinutes: 0 };

  for (const proj of rootProjects) {
    const s = computeProjectStats(proj);
    globalStats.pending += s.pending;
    globalStats.done += s.done;
    globalStats.cancelled += s.cancelled;
    globalStats.total += s.total;
    globalStats.estMinutes += s.estMinutes;
  }

  // Also count orphan tasks (tasks not under any project)
  const projectTaskLines = new Set<number>();
  function collectProjectTaskLines(proj: ParsedProject) {
    for (const child of proj.children) {
      if ("state" in child) {
        projectTaskLines.add(child.line);
      } else {
        collectProjectTaskLines(child);
      }
    }
  }
  for (const proj of rootProjects) {
    collectProjectTaskLines(proj);
  }

  for (const task of allTasks) {
    if (!projectTaskLines.has(task.line)) {
      globalStats.total++;
      if (task.state === "pending") {
        globalStats.pending++;
        globalStats.estMinutes += task.estMinutes;
      } else if (task.state === "done") {
        globalStats.done++;
      } else {
        globalStats.cancelled++;
      }
    }
  }

  return {
    projects: rootProjects,
    tasks: allTasks,
    globalStats,
  };
}
