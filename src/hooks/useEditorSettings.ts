import { useState, useCallback } from "react";

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  showLineNumbers: boolean;
}

const STORAGE_KEY = "editor-settings";

const DEFAULTS: EditorSettings = {
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
  fontSize: 14,
  lineHeight: 1.7,
  showLineNumbers: true,
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
