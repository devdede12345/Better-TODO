import {
  StreamLanguage,
  LanguageSupport,
  StreamParser,
} from "@codemirror/language";

interface TodoState {
  inArchive: boolean;
}

const todoParser: StreamParser<TodoState> = {
  startState(): TodoState {
    return { inArchive: false };
  },

  token(stream, state): string | null {
    // Start of line checks
    if (stream.sol()) {
      // Check for Archive section
      if (stream.match(/^Archive:/)) {
        state.inArchive = true;
        return "keyword";
      }

      // Project header (line ending with colon, not a tag)
      if (stream.match(/^[^\n:]+:$/)) {
        return "heading";
      }

      // Check for project header with content after it (don't consume the line yet)
      if (stream.match(/^[\w\s]+:\s*$/, false)) {
        stream.match(/^[\w\s]+:/);
        return "heading";
      }
    }

    // Skip whitespace
    if (stream.eatSpace()) return null;

    // Completed task marker: ✔ or [x] or [X]
    if (stream.match(/✔/) || stream.match(/\[x\]/i)) {
      return "todo-done-marker";
    }

    // Cancelled task marker: ✘
    if (stream.match(/✘/)) {
      return "todo-cancelled-marker";
    }

    // Pending task marker: ☐ or [ ]
    if (stream.match(/☐/) || stream.match(/\[ \]/)) {
      return "todo-pending-marker";
    }

    // Bullet marker: - or *
    if (stream.sol() || stream.string.slice(0, stream.pos).trim() === "") {
      if (stream.match(/^[-*]\s/)) {
        return "todo-bullet";
      }
    }

    // @done tag
    if (stream.match(/@done(\([^)]*\))?/)) {
      return "todo-tag-done";
    }

    // @cancelled / @canceled tag
    if (stream.match(/@cancel(?:led)?(\([^)]*\))?/)) {
      return "todo-tag-cancelled";
    }

    // @critical / @high tag
    if (stream.match(/@(?:critical|high)/)) {
      return "todo-tag-critical";
    }

    // @low tag
    if (stream.match(/@low/)) {
      return "todo-tag-low";
    }

    // @due tag with optional date
    if (stream.match(/@due(\([^)]*\))?/)) {
      return "todo-tag-due";
    }

    // @started tag
    if (stream.match(/@started(\([^)]*\))?/)) {
      return "todo-tag-started";
    }

    // @today tag
    if (stream.match(/@today/)) {
      return "todo-tag-today";
    }

    // Generic @tag
    if (stream.match(/@\w[\w-]*/)) {
      return "todo-tag";
    }

    // +project
    if (stream.match(/\+\w[\w-]*/)) {
      return "todo-project";
    }

    // Priority markers: !1 !2 !3
    if (stream.match(/![1-3]/)) {
      return "todo-priority";
    }

    // URL detection
    if (stream.match(/https?:\/\/[^\s]+/)) {
      return "url";
    }

    // Text after done marker on same line (strikethrough effect)
    // We handle this via decoration instead

    // Advance one character
    stream.next();
    return null;
  },
};

const todoLang = StreamLanguage.define(todoParser);

export function todoLanguage(): LanguageSupport {
  return new LanguageSupport(todoLang);
}
