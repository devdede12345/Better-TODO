import { useEffect, useRef, useCallback } from "react";
import { EditorState, Prec, Compartment } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import type { EditorSettings } from "../hooks/useEditorSettings";
import { normalizeFontFamily } from "../hooks/useEditorSettings";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { indentOnInput, foldGutter, bracketMatching, indentUnit } from "@codemirror/language";
import { highlightSelectionMatches } from "@codemirror/search";
import { EditorSelection } from "@codemirror/state";

import { todoLanguage } from "../editor/todo-language";
import { todoEditorTheme, todoHighlighting } from "../editor/todo-theme";
import { buildTodoKeymap, todoClickToggle, todoSlashCommands, setSlashCommands } from "../editor/todo-keymap";
import { todoDecorations } from "../editor/todo-decorations";
import { parseTodoDocument, type ParsedDocument } from "../editor/todoParser";

interface TodoEditorProps {
  initialContent: string;
  onChange?: (content: string) => void;
  onParsed?: (parsed: ParsedDocument) => void;
  settings?: EditorSettings;
}

export default function TodoEditor({ initialContent, onChange, onParsed, settings }: TodoEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lineNumbersCompartment = useRef(new Compartment());
  const editorStyleCompartment = useRef(new Compartment());
  const keymapCompartment = useRef(new Compartment());

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

    const fontFamily = normalizeFontFamily(settings?.fontFamily);
    const fontSize = settings?.fontSize ?? 14;
    const lineHeight = settings?.lineHeight ?? 1.7;
    const showLineNumbers = settings?.showLineNumbers ?? true;

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        // Core editing
        lineNumbersCompartment.current.of(showLineNumbers ? lineNumbers() : []),
        editorStyleCompartment.current.of(
          EditorView.theme({
            ".cm-editor": { fontSize: `${fontSize}px` },
            ".cm-scroller": { fontFamily, lineHeight: String(lineHeight) },
            ".cm-content": { fontFamily },
            ".cm-gutters": { fontFamily },
          })
        ),
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

        // Folding
        foldGutter({
          openText: "▾",
          closedText: "▸",
        }),

        // Keymaps — todoKeymap via compartment for dynamic rebinding
        Prec.highest(keymapCompartment.current.of(buildTodoKeymap(settings?.shortcuts))),
        todoClickToggle,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
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

  // Dynamically reconfigure editor when settings change
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !settings) return;

    const fontFamily = normalizeFontFamily(settings.fontFamily);
    const fontSize = settings.fontSize ?? 14;
    const lh = settings.lineHeight ?? 1.7;
    const showLN = settings.showLineNumbers ?? true;

    view.dispatch({
      effects: [
        lineNumbersCompartment.current.reconfigure(showLN ? lineNumbers() : []),
        editorStyleCompartment.current.reconfigure(
          EditorView.theme({
            ".cm-editor": { fontSize: `${fontSize}px` },
            ".cm-scroller": { fontFamily, lineHeight: String(lh) },
            ".cm-content": { fontFamily },
            ".cm-gutters": { fontFamily },
          })
        ),
      ],
    });
  }, [settings?.fontFamily, settings?.fontSize, settings?.lineHeight, settings?.showLineNumbers]);

  // Dynamically reconfigure keymap when shortcuts change
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !settings?.shortcuts) return;

    view.dispatch({
      effects: keymapCompartment.current.reconfigure(
        buildTodoKeymap(settings.shortcuts)
      ),
    });
  }, [settings?.shortcuts]);

  // Sync slash commands from settings to the global store
  useEffect(() => {
    if (settings?.slashCommands) {
      setSlashCommands(settings.slashCommands);
    }
  }, [settings?.slashCommands]);

  // Update content if initialContent changes externally (e.g., file open)
  const setContent = useCallback((content: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    });
  }, []);

  const focusLine = useCallback((lineNumber: number) => {
    const view = viewRef.current;
    if (!view) return;
    const maxLine = view.state.doc.lines;
    const safeLine = Math.max(1, Math.min(maxLine, Math.floor(lineNumber)));
    const line = view.state.doc.line(safeLine);

    view.dispatch({
      selection: EditorSelection.single(line.from, line.to),
      scrollIntoView: true,
    });
    view.focus();
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
    (window as any).__todoEditorFocusLine = focusLine;
    return () => {
      delete (window as any).__todoEditorSetContent;
      delete (window as any).__todoEditorCreateNewTask;
      delete (window as any).__todoEditorFocusLine;
    };
  }, [setContent, createNewTask, focusLine]);

  return (
    <div
      ref={editorRef}
      className="flex-1 overflow-hidden"
      style={{ height: "100%" }}
    />
  );
}
