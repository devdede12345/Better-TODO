import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";

// Toggle the task marker on the current line between ☐ and ✔
function toggleTask(view: EditorView): boolean {
  const { state } = view;
  const changes: { from: number; to: number; insert: string }[] = [];

  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    const text = line.text;

    if (text.includes("☐")) {
      // Pending -> Done
      const idx = line.from + text.indexOf("☐");
      changes.push({ from: idx, to: idx + "☐".length, insert: "✔" });
      // Add @done tag if not present
      if (!text.includes("@done")) {
        const now = new Date().toISOString().slice(0, 10);
        changes.push({ from: line.to, to: line.to, insert: ` @done(${now})` });
      }
    } else if (text.includes("✔")) {
      // Done -> Cancelled
      const idx = line.from + text.indexOf("✔");
      changes.push({ from: idx, to: idx + "✔".length, insert: "✘" });
      // Replace @done with @cancelled
      const doneMatch = text.match(/@done(\([^)]*\))?/);
      if (doneMatch) {
        const doneIdx = line.from + text.indexOf(doneMatch[0]);
        const now = new Date().toISOString().slice(0, 10);
        changes.push({
          from: doneIdx,
          to: doneIdx + doneMatch[0].length,
          insert: `@cancelled(${now})`,
        });
      }
    } else if (text.includes("✘")) {
      // Cancelled -> Pending
      const idx = line.from + text.indexOf("✘");
      changes.push({ from: idx, to: idx + "✘".length, insert: "☐" });
      // Remove @cancelled tag
      const cancelMatch = text.match(/ ?@cancel(?:led)?(\([^)]*\))?/);
      if (cancelMatch) {
        const cancelIdx = line.from + text.indexOf(cancelMatch[0]);
        changes.push({
          from: cancelIdx,
          to: cancelIdx + cancelMatch[0].length,
          insert: "",
        });
      }
      // Remove @done tag if present
      const doneMatch = text.match(/ ?@done(\([^)]*\))?/);
      if (doneMatch) {
        const doneIdx = line.from + text.indexOf(doneMatch[0]);
        changes.push({
          from: doneIdx,
          to: doneIdx + doneMatch[0].length,
          insert: "",
        });
      }
    } else if (text.match(/^\s*[-*]\s/) || text.match(/^\s*\[[ xX]\]/)) {
      // Convert plain bullet to todo
      const bulletMatch = text.match(/^(\s*)([-*]\s)/);
      if (bulletMatch) {
        const idx = line.from + bulletMatch[1].length;
        changes.push({
          from: idx,
          to: idx + bulletMatch[2].length,
          insert: "☐ ",
        });
      }
      const bracketMatch = text.match(/^(\s*)\[ \]/);
      if (bracketMatch) {
        const idx = line.from + bracketMatch[1].length;
        changes.push({
          from: idx,
          to: idx + "[ ]".length,
          insert: "☐",
        });
      }
      const bracketDoneMatch = text.match(/^(\s*)\[[xX]\]/);
      if (bracketDoneMatch) {
        const idx = line.from + bracketDoneMatch[1].length;
        changes.push({
          from: idx,
          to: idx + "[x]".length,
          insert: "✔",
        });
      }
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

// Add a new task below current line with same indentation
function newTask(view: EditorView): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const indent = line.text.match(/^(\s*)/)?.[1] || "";
  // If current line has a marker, inherit indentation; otherwise use current indent + default marker
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
          changes.push({ from: line.from + idx, to: line.from + idx + "☐".length, insert: "✔" });
          if (!text.includes("@done")) {
            changes.push({ from: line.to, to: line.to, insert: ` @done(${now})` });
          }
        } else if (marker === "✔") {
          changes.push({ from: line.from + idx, to: line.from + idx + "✔".length, insert: "✘" });
          const doneMatch = text.match(/@done(\([^)]*\))?/);
          if (doneMatch) {
            const doneIdx = line.from + text.indexOf(doneMatch[0]);
            changes.push({
              from: doneIdx,
              to: doneIdx + doneMatch[0].length,
              insert: `@cancelled(${now})`,
            });
          }
        } else if (marker === "✘") {
          changes.push({ from: line.from + idx, to: line.from + idx + "✘".length, insert: "☐" });
          const cancelMatch = text.match(/ ?@cancel(?:led)?(\([^)]*\))?/);
          if (cancelMatch) {
            const cancelIdx = line.from + text.indexOf(cancelMatch[0]);
            changes.push({ from: cancelIdx, to: cancelIdx + cancelMatch[0].length, insert: "" });
          }
          const doneMatch = text.match(/ ?@done(\([^)]*\))?/);
          if (doneMatch) {
            const doneIdx = line.from + text.indexOf(doneMatch[0]);
            changes.push({ from: doneIdx, to: doneIdx + doneMatch[0].length, insert: "" });
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
    run: toggleTask,
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
