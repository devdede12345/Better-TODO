import { useEffect, useRef, useCallback } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { indentOnInput, foldGutter, bracketMatching, indentUnit } from "@codemirror/language";
import { search, highlightSelectionMatches, searchKeymap } from "@codemirror/search";

import { todoLanguage } from "../editor/todo-language";
import { todoEditorTheme, todoHighlighting } from "../editor/todo-theme";
import { todoKeymap, todoClickToggle } from "../editor/todo-keymap";
import { todoDecorations } from "../editor/todo-decorations";

interface TodoEditorProps {
  initialContent: string;
  onChange?: (content: string) => void;
}

export default function TodoEditor({ initialContent, onChange }: TodoEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current?.(update.state.doc.toString());
      }
    });

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

        // Keymaps
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        todoKeymap,
        todoClickToggle,

        // Language & theme
        todoLanguage(),
        todoEditorTheme,
        todoHighlighting,
        todoDecorations,

        // Listeners
        updateListener,

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

  // Expose setContent for parent use
  useEffect(() => {
    (window as any).__todoEditorSetContent = setContent;
    return () => {
      delete (window as any).__todoEditorSetContent;
    };
  }, [setContent]);

  return (
    <div
      ref={editorRef}
      className="flex-1 overflow-hidden"
      style={{ height: "100%" }}
    />
  );
}
