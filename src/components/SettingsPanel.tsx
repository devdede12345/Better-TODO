import { useState, useRef, useEffect, useCallback } from "react";
import { X, RotateCcw, Plus, Trash2 } from "lucide-react";
import { type EditorSettings, type ShortcutMap, type SlashCommand, FONT_OPTIONS, DEFAULT_SHORTCUTS, DEFAULT_SLASH_COMMANDS, normalizeFontFamily } from "../hooks/useEditorSettings";

interface SettingsPanelProps {
  settings: EditorSettings;
  onUpdate: (patch: Partial<EditorSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function SettingsPanel({ settings, onUpdate, onReset, onClose }: SettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // System settings loaded from electron
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(false);

  // Load system settings on mount
  useEffect(() => {
    window.electronAPI?.systemGetSettings?.().then((s) => {
      setAutoLaunch(s.autoLaunch);
      setMinimizeToTray(s.minimizeToTray);
    });
  }, []);

  const handleAutoLaunchToggle = useCallback(async () => {
    const next = !autoLaunch;
    setAutoLaunch(next);
    await window.electronAPI?.systemSetAutoLaunch?.(next);
  }, [autoLaunch]);

  const handleMinimizeToTrayToggle = useCallback(async () => {
    const next = !minimizeToTray;
    setMinimizeToTray(next);
    await window.electronAPI?.systemSetMinimizeToTray?.(next);
  }, [minimizeToTray]);

  // Shortcut recording state
  const [recordingAction, setRecordingAction] = useState<string | null>(null);

  const handleShortcutKeyDown = useCallback(
    (e: React.KeyboardEvent, action: string) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore lone modifier keys
      const ignoreKeys = ["Control", "Shift", "Alt", "Meta"];
      if (ignoreKeys.includes(e.key)) return;

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");

      // Normalize key name
      let key = e.key;
      if (key === " ") key = "Space";
      else if (key === "Enter") key = "Enter";
      else if (key.length === 1) key = key.toUpperCase();

      parts.push(key);
      const combo = parts.join("+");

      const updated: ShortcutMap = { ...settings.shortcuts, [action]: combo };
      onUpdate({ shortcuts: updated });
      setRecordingAction(null);
    },
    [settings.shortcuts, onUpdate]
  );

  // Close on Escape (only if not recording)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !recordingAction) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, recordingAction]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const sliderClass = "flex-1 h-1 accent-[rgb(var(--editor-accent))] bg-editor-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[rgb(var(--editor-accent))] [&::-webkit-slider-thumb]:shadow-md";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={panelRef}
        className="w-[480px] max-h-[85vh] overflow-y-auto rounded-xl border border-editor-border bg-editor-bg shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-editor-border sticky top-0 bg-editor-bg z-10">
          <h2 className="text-sm font-semibold text-editor-text">Settings</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onReset}
              className="p-1.5 rounded hover:bg-editor-border/60 transition-colors"
              title="Reset to defaults"
            >
              <RotateCcw size={14} className="text-editor-subtext" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-editor-border/60 transition-colors"
              title="Close"
            >
              <X size={14} className="text-editor-subtext" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-6">

          {/* ── Section: Appearance & Editor ── */}
          <div>
            <SectionTitle>Appearance & Editor</SectionTitle>

            <SettingRow label="Font Family">
              <select
                value={settings.fontFamily}
                onChange={(e) => onUpdate({ fontFamily: e.target.value })}
                className="w-full px-2.5 py-1.5 text-[12px] rounded-md border border-editor-border bg-editor-surface text-editor-text focus:outline-none focus:ring-1 focus:ring-editor-accent/50 appearance-none cursor-pointer"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-editor-muted">
                Preview: <span style={{ fontFamily: normalizeFontFamily(settings.fontFamily) }}>AaBbCc 0123</span>
              </p>
            </SettingRow>

            <SettingRow label="Line Height">
              <div className="flex items-center gap-3">
                <input type="range" min={1.2} max={2.4} step={0.1} value={settings.lineHeight} onChange={(e) => onUpdate({ lineHeight: Number(e.target.value) })} className={sliderClass} />
                <span className="text-[12px] text-editor-subtext tabular-nums w-8 text-right">{settings.lineHeight.toFixed(1)}</span>
              </div>
            </SettingRow>

            <SettingRow label="Show Line Numbers">
              <Toggle value={settings.showLineNumbers} onChange={() => onUpdate({ showLineNumbers: !settings.showLineNumbers })} />
            </SettingRow>
          </div>

          {/* ── Section: System / Electron ── */}
          <div>
            <SectionTitle>System</SectionTitle>

            <SettingRow label="Run on Startup">
              <Toggle value={autoLaunch} onChange={handleAutoLaunchToggle} />
              <p className="mt-1 text-[10px] text-editor-muted">Launch Better TODO when you log in</p>
            </SettingRow>

            <SettingRow label="Minimize to Tray">
              <Toggle value={minimizeToTray} onChange={handleMinimizeToTrayToggle} />
              <p className="mt-1 text-[10px] text-editor-muted">Hide to system tray instead of quitting when closing the window</p>
            </SettingRow>
          </div>

          {/* ── Section: Custom Completions ── */}
          <div>
            <SectionTitle>Custom Completions</SectionTitle>
            <p className="text-[10px] text-editor-muted mb-3">
              Type the trigger in the editor and it auto-expands. Tokens:
              <code className="ml-1 px-1 py-0.5 rounded bg-editor-surface text-editor-accent text-[9px]">
                {'{YYYY}'} {'{MM}'} {'{DD}'} {'{HH}'} {'{mm}'} {'{ss}'} {'{M}'} {'{D}'} {'{H}'} {'{h}'} {'{hh}'} {'{A}'} {'{a}'} {'{W}'} {'{YY}'}
              </code>
            </p>
            <div className="space-y-2">
              {(settings.slashCommands ?? []).map((cmd, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={cmd.trigger}
                    onChange={(e) => {
                      const updated = [...(settings.slashCommands ?? [])];
                      updated[idx] = { ...updated[idx], trigger: e.target.value };
                      onUpdate({ slashCommands: updated });
                    }}
                    placeholder="/trigger"
                    className="w-24 px-2 py-1.5 text-[11px] rounded-md border border-editor-border bg-editor-surface text-editor-text focus:outline-none focus:ring-1 focus:ring-editor-accent/50 font-mono"
                  />
                  <span className="text-[11px] text-editor-muted">→</span>
                  <input
                    value={cmd.template}
                    onChange={(e) => {
                      const updated = [...(settings.slashCommands ?? [])];
                      updated[idx] = { ...updated[idx], template: e.target.value };
                      onUpdate({ slashCommands: updated });
                    }}
                    placeholder="{MM}{DD}{HH}{mm}"
                    className="flex-1 px-2 py-1.5 text-[11px] rounded-md border border-editor-border bg-editor-surface text-editor-text focus:outline-none focus:ring-1 focus:ring-editor-accent/50 font-mono"
                  />
                  <button
                    onClick={() => {
                      const updated = (settings.slashCommands ?? []).filter((_, i) => i !== idx);
                      onUpdate({ slashCommands: updated });
                    }}
                    className="p-1 rounded hover:bg-editor-border/60 text-editor-muted hover:text-editor-red transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const updated = [...(settings.slashCommands ?? []), { trigger: "/", template: "" }];
                onUpdate({ slashCommands: updated });
              }}
              className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-editor-accent hover:bg-editor-accent/10 rounded-md transition-colors"
            >
              <Plus size={12} />
              Add completion
            </button>
          </div>

          {/* ── Section: Keyboard Shortcuts ── */}
          <div>
            <SectionTitle>Keyboard Shortcuts</SectionTitle>
            <div className="rounded-lg border border-editor-border overflow-hidden">
              {Object.keys(DEFAULT_SHORTCUTS).map((action, idx) => {
                const current = settings.shortcuts?.[action] ?? DEFAULT_SHORTCUTS[action];
                const isRecording = recordingAction === action;
                const isModified = current !== DEFAULT_SHORTCUTS[action];
                return (
                  <div
                    key={action}
                    className={`flex items-center justify-between px-3 py-2 ${idx > 0 ? "border-t border-editor-border/50" : ""} ${isRecording ? "bg-editor-accent/10" : "hover:bg-editor-surface/50"}`}
                  >
                    <span className="text-[12px] text-editor-subtext">{action}</span>
                    <div className="flex items-center gap-2">
                      {isRecording ? (
                        <input
                          autoFocus
                          readOnly
                          placeholder="Press keys..."
                          onKeyDown={(e) => handleShortcutKeyDown(e, action)}
                          onBlur={() => setRecordingAction(null)}
                          className="w-36 px-2 py-1 text-[11px] text-center rounded border border-editor-accent bg-editor-accent/10 text-editor-accent focus:outline-none placeholder-editor-accent/50"
                        />
                      ) : (
                        <button
                          onClick={() => setRecordingAction(action)}
                          className={`px-2 py-1 text-[11px] rounded border transition-colors cursor-pointer ${
                            isModified
                              ? "border-editor-yellow/50 bg-editor-yellow/10 text-editor-yellow"
                              : "border-editor-border bg-editor-surface/60 text-editor-subtext hover:border-editor-accent/50 hover:text-editor-text"
                          }`}
                          title="Click to rebind"
                        >
                          {current}
                        </button>
                      )}
                      {isModified && !isRecording && (
                        <button
                          onClick={() => {
                            const updated = { ...settings.shortcuts, [action]: DEFAULT_SHORTCUTS[action] };
                            onUpdate({ shortcuts: updated });
                          }}
                          className="text-[10px] text-editor-muted hover:text-editor-text transition-colors"
                          title="Reset to default"
                        >
                          <RotateCcw size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold text-editor-muted uppercase tracking-wider mb-3">
      {children}
    </h3>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <label className="text-[12px] text-editor-subtext pt-1 shrink-0 w-[130px]">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors ${value ? "bg-editor-accent" : "bg-editor-border"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}
