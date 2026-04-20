import { useRef, useEffect } from "react";
import { X, RotateCcw } from "lucide-react";
import { type EditorSettings, FONT_OPTIONS } from "../hooks/useEditorSettings";

interface SettingsPanelProps {
  settings: EditorSettings;
  onUpdate: (patch: Partial<EditorSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function SettingsPanel({ settings, onUpdate, onReset, onClose }: SettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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

  // Find the matching font option label, fallback to custom
  const currentFontLabel =
    FONT_OPTIONS.find((f) => f.value === settings.fontFamily)?.label ?? "Custom";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={panelRef}
        className="w-[420px] max-h-[80vh] overflow-y-auto rounded-xl border border-editor-border bg-editor-bg shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-editor-border">
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
        <div className="px-5 py-4 space-y-5">
          {/* Section: Appearance & Editor */}
          <div>
            <h3 className="text-[11px] font-semibold text-editor-muted uppercase tracking-wider mb-3">
              Appearance & Editor
            </h3>

            {/* Font Family */}
            <SettingRow label="Font Family">
              <select
                value={settings.fontFamily}
                onChange={(e) => onUpdate({ fontFamily: e.target.value })}
                className="w-full px-2.5 py-1.5 text-[12px] rounded-md border border-editor-border bg-editor-surface text-editor-text focus:outline-none focus:ring-1 focus:ring-editor-accent/50 appearance-none cursor-pointer"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-editor-muted">
                Preview: <span style={{ fontFamily: settings.fontFamily }}>AaBbCc 0123</span>
              </p>
            </SettingRow>

            {/* Font Size */}
            <SettingRow label="Font Size">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={24}
                  step={1}
                  value={settings.fontSize}
                  onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
                  className="flex-1 h-1 accent-[rgb(var(--editor-accent))] bg-editor-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[rgb(var(--editor-accent))] [&::-webkit-slider-thumb]:shadow-md"
                />
                <span className="text-[12px] text-editor-subtext tabular-nums w-8 text-right">
                  {settings.fontSize}px
                </span>
              </div>
            </SettingRow>

            {/* Line Height */}
            <SettingRow label="Line Height">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1.2}
                  max={2.4}
                  step={0.1}
                  value={settings.lineHeight}
                  onChange={(e) => onUpdate({ lineHeight: Number(e.target.value) })}
                  className="flex-1 h-1 accent-[rgb(var(--editor-accent))] bg-editor-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[rgb(var(--editor-accent))] [&::-webkit-slider-thumb]:shadow-md"
                />
                <span className="text-[12px] text-editor-subtext tabular-nums w-8 text-right">
                  {settings.lineHeight.toFixed(1)}
                </span>
              </div>
            </SettingRow>

            {/* Show Line Numbers */}
            <SettingRow label="Show Line Numbers">
              <button
                onClick={() => onUpdate({ showLineNumbers: !settings.showLineNumbers })}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  settings.showLineNumbers
                    ? "bg-editor-accent"
                    : "bg-editor-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    settings.showLineNumbers ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </SettingRow>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <label className="text-[12px] text-editor-subtext pt-1 shrink-0 w-[120px]">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
