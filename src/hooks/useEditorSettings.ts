import { useState, useCallback } from "react";

export interface ShortcutMap {
  [action: string]: string;
}

export interface SlashCommand {
  trigger: string;   // e.g. "/time"
  template: string;  // e.g. "{MM}{DD}{HH}{mm}" or plain text
}

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  showLineNumbers: boolean;
  shortcuts: ShortcutMap;
  slashCommands: SlashCommand[];
}

const STORAGE_KEY = "editor-settings";

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  "Toggle Done": "Ctrl+D",
  "Toggle Cancelled": "Alt+C",
  "Toggle Started": "Ctrl+M",
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

export const DEFAULT_SLASH_COMMANDS: SlashCommand[] = [
  { trigger: "/time", template: "{MM}{DD}{HH}{mm}" },
  { trigger: "/date", template: "{YYYY}-{MM}-{DD}" },
  { trigger: "/now", template: "{YYYY}/{M}/{D} {HH}:{mm}" },
  { trigger: "/today", template: "@today({YYYY}-{MM}-{DD})" },
];

export const DEFAULT_FONT_FAMILY = '"JetBrains Mono", "Fira Code", "Cascadia Code", "Source Code Pro", "IBM Plex Mono", Menlo, Monaco, Consolas, ui-monospace, monospace';

const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "emoji",
  "math",
  "fangsong",
]);

function normalizeFontFamilyToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";

  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  if (quoted) return trimmed;

  const plain = trimmed.toLowerCase();
  if (GENERIC_FONT_FAMILIES.has(plain)) return plain;

  if (/\s/.test(trimmed)) return `"${trimmed}"`;
  return trimmed;
}

export function normalizeFontFamily(value?: string): string {
  const raw = (value || "").trim();
  const source = raw || DEFAULT_FONT_FAMILY;

  const normalized = source
    .split(",")
    .map(normalizeFontFamilyToken)
    .filter(Boolean);

  if (normalized.length === 0) return DEFAULT_FONT_FAMILY;

  const hasGeneric = normalized.some((token) => {
    const unquoted = token.replace(/^['"]|['"]$/g, "").toLowerCase();
    return GENERIC_FONT_FAMILIES.has(unquoted);
  });

  if (!hasGeneric) normalized.push("monospace");
  return normalized.join(", ");
}

const DEFAULTS: EditorSettings = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: 14,
  lineHeight: 1.7,
  showLineNumbers: true,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  slashCommands: [...DEFAULT_SLASH_COMMANDS],
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
  { label: "Apple System (macOS default)", value: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif' },
  { label: "Segoe UI (Windows default)", value: '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", Tahoma, Arial, sans-serif' },
  { label: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
  { label: "Fira Code", value: '"Fira Code", monospace' },
  { label: "Cascadia Code", value: '"Cascadia Code", monospace' },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Source Code Pro", value: '"Source Code Pro", monospace' },
  { label: "IBM Plex Mono", value: '"IBM Plex Mono", monospace' },
  { label: "Menlo", value: "Menlo, monospace" },
  { label: "Monaco", value: "Monaco, monospace" },
];
