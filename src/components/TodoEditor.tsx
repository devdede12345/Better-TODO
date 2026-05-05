import { useEffect, useRef, useCallback, useState } from "react";
import { EditorState, Prec, Compartment } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import type { EditorSettings } from "../hooks/useEditorSettings";
import { normalizeFontFamily } from "../hooks/useEditorSettings";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { indentOnInput, foldGutter, bracketMatching, indentUnit, foldService, foldKeymap } from "@codemirror/language";
import { highlightSelectionMatches } from "@codemirror/search";
import { EditorSelection } from "@codemirror/state";

import { todoLanguage } from "../editor/todo-language";
import { todoEditorTheme, todoHighlighting } from "../editor/todo-theme";
import { buildTodoKeymap, todoClickToggle, todoSlashCommands, setSlashCommands } from "../editor/todo-keymap";
import { todoDecorations } from "../editor/todo-decorations";
import { parseTodoDocument, type ParsedDocument } from "../editor/todoParser";
import {
  useCategoryColors,
  setCategoryColor,
  CATEGORY_PALETTE,
} from "../editor/categoryColors";

/**
 * Fold service: a "Section Header:" line is foldable. The folded range
 * spans from the end of the header line to the end of the last line whose
 * indentation is strictly greater than the header's indent. Blank lines
 * between children are included transparently.
 */
const todoFoldService = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  const text = line.text;
  const trimmed = text.trim();
  if (trimmed.length <= 1) return null;
  if (!trimmed.endsWith(":")) return null;
  // Skip task-marker lines ("☐ foo:" etc.) — only true section headers fold.
  if (/^\s*[☐✔✘]\s+/.test(text)) return null;

  const headerIndent = /^\s*/.exec(text)![0].length;
  let endLine = line.number;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const l = state.doc.line(n);
    const lt = l.text;
    if (lt.trim().length === 0) continue; // blanks don't break a block
    const ind = /^\s*/.exec(lt)![0].length;
    if (ind <= headerIndent) break;
    endLine = n;
  }
  if (endLine === line.number) return null;
  return { from: line.to, to: state.doc.line(endLine).to };
});

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

  // Right-click on section header → category color picker
  const customColors = useCategoryColors();
  const [sectionColorPicker, setSectionColorPicker] = useState<
    { x: number; y: number; category: string } | null
  >(null);

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
        todoFoldService,
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
          ...foldKeymap,
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

    // Right-click a section header ("Category:") to change its colour.
    const container = editorRef.current;
    const onContextMenu = (e: MouseEvent) => {
      const v = viewRef.current;
      if (!v) return;
      const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) return;
      const line = v.state.doc.lineAt(pos);
      const text = line.text;
      const trimmed = text.trim();
      if (trimmed.length <= 1) return;
      if (!trimmed.endsWith(":")) return;
      if (/^\s*[☐✔✘]\s+/.test(text)) return;
      const m = text.match(/^(\s*)(.*?):\s*(@.*)?$/);
      const category = (m?.[2] ?? trimmed.slice(0, -1)).trim();
      if (!category) return;
      e.preventDefault();
      setSectionColorPicker({ x: e.clientX, y: e.clientY, category });
    };
    container.addEventListener("contextmenu", onContextMenu);

    return () => {
      container.removeEventListener("contextmenu", onContextMenu);
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

  // Dismiss color picker on outside click / Esc
  useEffect(() => {
    if (!sectionColorPicker) return;
    const onDown = (e: MouseEvent) => {
      const el = document.getElementById("section-color-picker");
      if (el && !el.contains(e.target as Node)) setSectionColorPicker(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSectionColorPicker(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [sectionColorPicker]);

  return (
    <>
      <div
        ref={editorRef}
        className="flex-1 overflow-hidden"
        style={{ height: "100%" }}
      />
      {sectionColorPicker && (
        <div
          id="section-color-picker"
          className="fixed z-[240] rounded-md border border-editor-border bg-editor-bg shadow-xl p-2"
          style={{ left: sectionColorPicker.x, top: sectionColorPicker.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="text-[10px] uppercase tracking-[0.12em] text-editor-muted px-1 pb-1.5 select-none">
            Section color · {sectionColorPicker.category}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {CATEGORY_PALETTE.map((c) => {
              const isCurrent = customColors[sectionColorPicker.category] === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCategoryColor(sectionColorPicker.category, c);
                    setSectionColorPicker(null);
                  }}
                  className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${
                    isCurrent ? "ring-2 ring-offset-1 ring-offset-editor-bg ring-white/70" : ""
                  }`}
                  style={{ backgroundColor: c, borderColor: `${c}aa` }}
                  title={c}
                />
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setCategoryColor(sectionColorPicker.category, null);
              setSectionColorPicker(null);
            }}
            className="mt-2 w-full text-[10px] text-editor-subtext hover:text-editor-text transition-colors py-1 rounded hover:bg-editor-overlay/30"
          >
            Reset to default
          </button>
        </div>
      )}
    </>
  );
}
