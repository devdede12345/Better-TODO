import { useEffect, useRef, useCallback } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { indentOnInput, foldGutter, bracketMatching, indentUnit } from "@codemirror/language";
import { search, highlightSelectionMatches, searchKeymap } from "@codemirror/search";

import { todoLanguage } from "../editor/todo-language";
import { todoEditorTheme, todoHighlighting } from "../editor/todo-theme";
import { todoKeymap, todoClickToggle, todoSlashCommands } from "../editor/todo-keymap";
import { todoDecorations } from "../editor/todo-decorations";
import { parseTodoDocument, type ParsedDocument } from "../editor/todoParser";

interface TodoEditorProps {
  initialContent: string;
  onChange?: (content: string) => void;
  onParsed?: (parsed: ParsedDocument) => void;
}

export default function TodoEditor({ initialContent, onChange, onParsed }: TodoEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onParsedRef = useRef(onParsed);
  onParsedRef.current = onParsed;

  useEffect(() => {
    if (!editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const text = update.state.doc.toString();
        onChangeRef.current?.(text);
        onParsedRef.current?.(parseTodoDocument(text));
      }
    });

    // Fire initial parse
    if (onParsedRef.current) {
      onParsedRef.current(parseTodoDocument(initialContent));
    }

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        // Core editing
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSpecialChars(),
        history(),
        indentOnInput(),
        bracketMatching(),
        highlightSelectionMatches(),
        indentUnit.of("  "),
        search({ top: true }),

        // Folding
        foldGutter({
          openText: "▾",
          closedText: "▸",
        }),

        // Keymaps — todoKeymap first with high precedence
        Prec.highest(todoKeymap),
        todoClickToggle,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),

        // Language & theme
        todoLanguage(),
        todoEditorTheme,
        todoHighlighting,
        todoDecorations,

        // Listeners
        updateListener,
        todoSlashCommands,

        // Editor config
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update content if initialContent changes externally (e.g., file open)
  const setContent = useCallback((content: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    });
  }, []);

  const createNewTask = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const { state } = view;
    const line = state.doc.lineAt(state.selection.main.head);
    const indent = line.text.match(/^(\s*)/)?.[1] || "";
    const isFirstLine = line.number === 1;
    const isLineEmpty = line.text.trim() === "";

    if (isFirstLine && isLineEmpty) {
      const insert = `${indent}☐ `;
      view.dispatch({
        changes: { from: line.from, to: line.to, insert },
        selection: { anchor: line.from + insert.length },
      });
      return;
    }

    const insert = `\n${indent}☐ `;
    view.dispatch({
      changes: { from: line.to, to: line.to, insert },
      selection: { anchor: line.to + insert.length },
    });
  }, []);

  // Expose setContent for parent use
  useEffect(() => {
    (window as any).__todoEditorSetContent = setContent;
    (window as any).__todoEditorCreateNewTask = createNewTask;
    return () => {
      delete (window as any).__todoEditorSetContent;
      delete (window as any).__todoEditorCreateNewTask;
    };
  }, [setContent, createNewTask]);

  return (
    <div
      ref={editorRef}
      className="flex-1 overflow-hidden"
      style={{ height: "100%" }}
    />
  );
}
