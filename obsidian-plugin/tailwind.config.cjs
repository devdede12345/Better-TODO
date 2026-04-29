/** @type {import('tailwindcss').Config} */
module.exports = {
  // Preflight is OFF so Tailwind's CSS reset doesn't fight Obsidian's own
  // base styles. Utilities are otherwise unprefixed because the Timeline
  // component reuses class names (e.g. `text-editor-text`) verbatim from
  // the standalone app.
  corePlugins: { preflight: false },
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', "Consolas", "monospace"],
      },
      colors: {
        editor: {
          bg: "rgb(var(--btodo-editor-bg) / <alpha-value>)",
          surface: "rgb(var(--btodo-editor-surface) / <alpha-value>)",
          overlay: "rgb(var(--btodo-editor-overlay) / <alpha-value>)",
          border: "rgb(var(--btodo-editor-border) / <alpha-value>)",
          text: "rgb(var(--btodo-editor-text) / <alpha-value>)",
          subtext: "rgb(var(--btodo-editor-subtext) / <alpha-value>)",
          muted: "rgb(var(--btodo-editor-muted) / <alpha-value>)",
          accent: "rgb(var(--btodo-editor-accent) / <alpha-value>)",
          green: "rgb(var(--btodo-editor-green) / <alpha-value>)",
          red: "rgb(var(--btodo-editor-red) / <alpha-value>)",
          yellow: "rgb(var(--btodo-editor-yellow) / <alpha-value>)",
          peach: "rgb(var(--btodo-editor-peach) / <alpha-value>)",
          mauve: "rgb(var(--btodo-editor-mauve) / <alpha-value>)",
          teal: "rgb(var(--btodo-editor-teal) / <alpha-value>)",
          pink: "rgb(var(--btodo-editor-pink) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
