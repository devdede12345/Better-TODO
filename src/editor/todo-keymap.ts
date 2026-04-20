import { EditorView, keymap } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";

// Toggle the task marker: ☐ → ✔ → ✘ → ☐ (Ctrl+D)
function toggleDone(view: EditorView): boolean {
  const { state } = view;
  const changes: { from: number; to: number; insert: string }[] = [];

  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    const text = line.text;
    const now = new Date().toISOString().slice(0, 10);

    if (text.includes("☐")) {
      // Pending -> Done
      const idx = line.from + text.indexOf("☐");
      changes.push({ from: idx, to: idx + "☐".length, insert: "✔" });
      if (!text.includes("@done")) {
        changes.push({ from: line.to, to: line.to, insert: ` @done(${now})` });
      }
    } else if (text.includes("✔")) {
      // Done -> Cancelled
      const idx = line.from + text.indexOf("✔");
      changes.push({ from: idx, to: idx + "✔".length, insert: "✘" });
      // Remove @done, add @cancelled
      const doneMatch = text.match(/ ?@done(\([^)]*\))?/);
      if (doneMatch) {
        const doneIdx = line.from + text.indexOf(doneMatch[0]);
        changes.push({ from: doneIdx, to: doneIdx + doneMatch[0].length, insert: "" });
      }
      if (!text.includes("@cancelled")) {
        changes.push({ from: line.to, to: line.to, insert: ` @cancelled(${now})` });
      }
    } else if (text.includes("✘")) {
      // Cancelled -> Pending
      const idx = line.from + text.indexOf("✘");
      changes.push({ from: idx, to: idx + "✘".length, insert: "☐" });
      const cancelMatch = text.match(/ ?@cancel(?:led)?(\([^)]*\))?/);
      if (cancelMatch) {
        const cancelIdx = line.from + text.indexOf(cancelMatch[0]);
        changes.push({ from: cancelIdx, to: cancelIdx + cancelMatch[0].length, insert: "" });
      }
    } else if (text.match(/^\s*[-*]\s/) || text.match(/^\s*\[[ xX]\]/)) {
      // Convert plain bullet/bracket to pending then mark done
      convertBulletToTodo(text, line, changes);
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

// Toggle the task marker on the current line between ☐ and ✘ (Alt+C)
function toggleCancelled(view: EditorView): boolean {
  const { state } = view;
  const changes: { from: number; to: number; insert: string }[] = [];

  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    const text = line.text;
    const now = new Date().toISOString().slice(0, 10);

    if (text.includes("☐")) {
      // Pending -> Cancelled
      const idx = line.from + text.indexOf("☐");
      changes.push({ from: idx, to: idx + "☐".length, insert: "✘" });
      if (!text.includes("@cancelled")) {
        changes.push({ from: line.to, to: line.to, insert: ` @cancelled(${now})` });
      }
    } else if (text.includes("✘")) {
      // Cancelled -> Pending (undo)
      const idx = line.from + text.indexOf("✘");
      changes.push({ from: idx, to: idx + "✘".length, insert: "☐" });
      const cancelMatch = text.match(/ ?@cancel(?:led)?(\([^)]*\))?/);
      if (cancelMatch) {
        const cancelIdx = line.from + text.indexOf(cancelMatch[0]);
        changes.push({ from: cancelIdx, to: cancelIdx + cancelMatch[0].length, insert: "" });
      }
    } else if (text.match(/^\s*[-*]\s/) || text.match(/^\s*\[[ xX]\]/)) {
      convertBulletToTodo(text, line, changes);
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

// Helper: convert plain bullet / bracket syntax to ☐ todo marker
function convertBulletToTodo(
  text: string,
  line: { from: number },
  changes: { from: number; to: number; insert: string }[]
) {
  const bulletMatch = text.match(/^(\s*)([-*]\s)/);
  if (bulletMatch) {
    const idx = line.from + bulletMatch[1].length;
    changes.push({ from: idx, to: idx + bulletMatch[2].length, insert: "☐ " });
    return;
  }
  const bracketMatch = text.match(/^(\s*)\[ \]/);
  if (bracketMatch) {
    const idx = line.from + bracketMatch[1].length;
    changes.push({ from: idx, to: idx + "[ ]".length, insert: "☐" });
    return;
  }
  const bracketDoneMatch = text.match(/^(\s*)\[[xX]\]/);
  if (bracketDoneMatch) {
    const idx = line.from + bracketDoneMatch[1].length;
    changes.push({ from: idx, to: idx + "[x]".length, insert: "✔" });
  }
}

// Toggle bold: wrap/unwrap selection with *...*
function toggleBold(view: EditorView): boolean {
  return toggleWrap(view, "*");
}

// Toggle italic: wrap/unwrap selection with _..._
function toggleItalic(view: EditorView): boolean {
  return toggleWrap(view, "_");
}

// Toggle underline: wrap/unwrap selection with __...__
function toggleUnderline(view: EditorView): boolean {
  return toggleWrap(view, "__");
}

// Generic wrap/unwrap helper for inline formatting
function toggleWrap(view: EditorView, marker: string): boolean {
  const { state } = view;
  const changes: { from: number; to: number; insert: string }[] = [];
  const selections: { anchor: number; head: number }[] = [];

  for (const range of state.selection.ranges) {
    const from = range.from;
    const to = range.to;

    if (from === to) {
      // No selection — insert marker pair and place cursor inside
      changes.push({ from, to, insert: marker + marker });
      selections.push({ anchor: from + marker.length, head: from + marker.length });
      continue;
    }

    const selected = state.sliceDoc(from, to);

    // Check if already wrapped
    const before = state.sliceDoc(Math.max(0, from - marker.length), from);
    const after = state.sliceDoc(to, Math.min(state.doc.length, to + marker.length));

    if (before === marker && after === marker) {
      // Unwrap: remove surrounding markers
      changes.push({ from: from - marker.length, to: from, insert: "" });
      changes.push({ from: to, to: to + marker.length, insert: "" });
      selections.push({ anchor: from - marker.length, head: to - marker.length });
    } else if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length > marker.length * 2) {
      // Selection includes the markers — unwrap by stripping them
      changes.push({ from, to, insert: selected.slice(marker.length, -marker.length) });
      selections.push({ anchor: from, head: to - marker.length * 2 });
    } else {
      // Wrap
      changes.push({ from, to, insert: marker + selected + marker });
      selections.push({ anchor: from + marker.length, head: to + marker.length });
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({
    changes,
    selection: selections.length > 0
      ? EditorSelection.create(selections.map(s => EditorSelection.range(s.anchor, s.head)))
      : undefined,
  });
  return true;
}

// Add a new task below current line with same indentation
function newTask(view: EditorView): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const indent = line.text.match(/^(\s*)/)?.[1] || "";
  const isLineEmpty = line.text.trim() === "";

  if (isLineEmpty) {
    const insert = `${indent}☐ `;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert },
      selection: { anchor: line.from + insert.length },
    });
    return true;
  }

  const insert = `\n${indent}☐ `;
  view.dispatch({
    changes: { from: line.to, to: line.to, insert },
    selection: { anchor: line.to + insert.length },
  });
  return true;
}

// Archive completed and cancelled tasks: move them under "Archive:" section
function archiveTasks(view: EditorView): boolean {
  const doc = view.state.doc.toString();
  const lines = doc.split("\n");
  const archiveIdx = lines.findIndex((l) => l.trim() === "Archive:");

  const doneLines: string[] = [];
  const remaining: string[] = [];

  for (const line of lines) {
    if (
      (line.includes("✔") || line.includes("✘")) &&
      !lines[lines.indexOf(line)]?.trim().startsWith("Archive:")
    ) {
      // Check this isn't already under Archive
      const lineIdx = lines.indexOf(line);
      if (archiveIdx >= 0 && lineIdx > archiveIdx) {
        remaining.push(line);
      } else {
        doneLines.push(line);
      }
    } else {
      remaining.push(line);
    }
  }

  if (doneLines.length === 0) return false;

  // Re-assemble with done lines under Archive
  let newDoc: string;
  const archiveInRemaining = remaining.findIndex((l) => l.trim() === "Archive:");
  if (archiveInRemaining >= 0) {
    const before = remaining.slice(0, archiveInRemaining + 1);
    const after = remaining.slice(archiveInRemaining + 1);
    newDoc = [
      ...before,
      ...doneLines.map((l) => "  " + l.trim()),
      ...after,
    ].join("\n");
  } else {
    newDoc = [...remaining, "", "Archive:", ...doneLines.map((l) => "  " + l.trim())].join(
      "\n"
    );
  }

  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: newDoc },
  });
  return true;
}

// Click handler: toggle task when clicking on ☐/✔/✘ markers
const clickToggle = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;

    const line = view.state.doc.lineAt(pos);
    const text = line.text;
    const clickOffset = pos - line.from;

    // Find marker in line and check if click is on it
    const markers = ["☐", "✔", "✘"];
    for (const marker of markers) {
      const idx = text.indexOf(marker);
      if (idx === -1) continue;
      // Marker chars are multi-byte; allow clicking within ±1 char
      if (clickOffset >= idx && clickOffset <= idx + 2) {
        // Prevent default to avoid cursor placement issues
        event.preventDefault();
        // Re-use toggleTask logic on this specific line
        const changes: { from: number; to: number; insert: string }[] = [];
        const now = new Date().toISOString().slice(0, 10);

        if (marker === "☐") {
          // Pending -> Done
          changes.push({ from: line.from + idx, to: line.from + idx + "☐".length, insert: "✔" });
          if (!text.includes("@done")) {
            changes.push({ from: line.to, to: line.to, insert: ` @done(${now})` });
          }
        } else if (marker === "✔") {
          // Done -> Pending (undo)
          changes.push({ from: line.from + idx, to: line.from + idx + "✔".length, insert: "☐" });
          const doneMatch = text.match(/ ?@done(\([^)]*\))?/);
          if (doneMatch) {
            const doneIdx = line.from + text.indexOf(doneMatch[0]);
            changes.push({ from: doneIdx, to: doneIdx + doneMatch[0].length, insert: "" });
          }
        } else if (marker === "✘") {
          // Cancelled -> Pending (undo)
          changes.push({ from: line.from + idx, to: line.from + idx + "✘".length, insert: "☐" });
          const cancelMatch = text.match(/ ?@cancel(?:led)?(\([^)]*\))?/);
          if (cancelMatch) {
            const cancelIdx = line.from + text.indexOf(cancelMatch[0]);
            changes.push({ from: cancelIdx, to: cancelIdx + cancelMatch[0].length, insert: "" });
          }
        }

        if (changes.length > 0) {
          view.dispatch({ changes });
        }
        return true;
      }
    }
    return false;
  },
});

export const todoKeymap = keymap.of([
  {
    key: "Ctrl-d",
    run: toggleDone,
  },
  {
    key: "Alt-c",
    run: toggleCancelled,
  },
  {
    key: "Ctrl-b",
    run: toggleBold,
  },
  {
    key: "Ctrl-i",
    run: toggleItalic,
  },
  {
    key: "Ctrl-u",
    run: toggleUnderline,
  },
  {
    key: "Ctrl-Shift-a",
    run: archiveTasks,
  },
  {
    key: "Ctrl-Enter",
    run: newTask,
  },
]);

export const todoClickToggle = clickToggle;

// ─── Slash commands (dynamic, template-based) ───────────────────────────────

interface SlashEntry {
  trigger: string;
  template: string;
}

// Global mutable store — updated from React via setSlashCommands()
let _slashEntries: SlashEntry[] = [
  { trigger: "/time", template: "{MM}{DD}{HH}{mm}" },
];

export function setSlashCommands(entries: SlashEntry[]) {
  _slashEntries = entries;
}

function expandTemplate(template: string): string {
  const now = new Date();
  const map: Record<string, string> = {
    "{YYYY}": String(now.getFullYear()),
    "{YY}": String(now.getFullYear()).slice(-2),
    "{M}": String(now.getMonth() + 1),
    "{MM}": String(now.getMonth() + 1).padStart(2, "0"),
    "{D}": String(now.getDate()),
    "{DD}": String(now.getDate()).padStart(2, "0"),
    "{H}": String(now.getHours()),
    "{HH}": String(now.getHours()).padStart(2, "0"),
    "{h}": String(now.getHours() % 12 || 12),
    "{hh}": String(now.getHours() % 12 || 12).padStart(2, "0"),
    "{m}": String(now.getMinutes()),
    "{mm}": String(now.getMinutes()).padStart(2, "0"),
    "{s}": String(now.getSeconds()),
    "{ss}": String(now.getSeconds()).padStart(2, "0"),
    "{A}": now.getHours() >= 12 ? "PM" : "AM",
    "{a}": now.getHours() >= 12 ? "pm" : "am",
    "{W}": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()],
  };
  let result = template;
  for (const [token, value] of Object.entries(map)) {
    result = result.split(token).join(value);
  }
  return result;
}

export const todoSlashCommands = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;

  update.transactions.forEach((tr) => {
    if (!tr.docChanged) return;

    const { state } = update;
    const pos = state.selection.main.head;
    const lineObj = state.doc.lineAt(pos);
    const textBefore = lineObj.text.slice(0, pos - lineObj.from);

    // Try each registered slash command
    for (const entry of _slashEntries) {
      if (!textBefore.endsWith(entry.trigger)) continue;

      const replacement = expandTemplate(entry.template);
      const cmdFrom = lineObj.from + textBefore.length - entry.trigger.length;
      const cmdTo = cmdFrom + entry.trigger.length;

      requestAnimationFrame(() => {
        update.view.dispatch({
          changes: { from: cmdFrom, to: cmdTo, insert: replacement },
          selection: { anchor: cmdFrom + replacement.length },
        });
      });
      break; // only first match
    }
  });
});
