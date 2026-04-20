import { useState, useCallback } from "react";

export interface ShortcutMap {
  [action: string]: string;
}

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  showLineNumbers: boolean;
  shortcuts: ShortcutMap;
}

const STORAGE_KEY = "editor-settings";

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  "Toggle Done": "Ctrl+D",
  "Toggle Cancelled": "Alt+C",
  "New Task": "Ctrl+Enter",
  "Archive Done": "Ctrl+Shift+A",
  "Bold": "Ctrl+B",
  "Italic": "Ctrl+I",
  "Underline": "Ctrl+U",
  "Save": "Ctrl+S",
  "Save As": "Ctrl+Shift+S",
  "Open File": "Ctrl+O",
  "Find": "Ctrl+F",
  "Replace": "Ctrl+H",
  "Undo": "Ctrl+Z",
  "Redo": "Ctrl+Shift+Z",
};

const DEFAULTS: EditorSettings = {
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
  fontSize: 14,
  lineHeight: 1.7,
  showLineNumbers: true,
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

function loadSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings: EditorSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function useEditorSettings() {
  const [settings, setSettingsState] = useState<EditorSettings>(loadSettings);

  const updateSettings = useCallback((patch: Partial<EditorSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettingsState({ ...DEFAULTS });
    saveSettings({ ...DEFAULTS });
  }, []);

  return { settings, updateSettings, resetSettings };
}

export const FONT_OPTIONS = [
  { label: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
  { label: "Fira Code", value: '"Fira Code", monospace' },
  { label: "Cascadia Code", value: '"Cascadia Code", monospace' },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Source Code Pro", value: '"Source Code Pro", monospace' },
  { label: "IBM Plex Mono", value: '"IBM Plex Mono", monospace' },
  { label: "Menlo", value: "Menlo, monospace" },
  { label: "Monaco", value: "Monaco, monospace" },
];
