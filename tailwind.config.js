/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./sticker.html", "./quickentry.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', "Consolas", "monospace"],
      },
      colors: {
        editor: {
          bg: "rgb(var(--editor-bg) / <alpha-value>)",
          surface: "rgb(var(--editor-surface) / <alpha-value>)",
          overlay: "rgb(var(--editor-overlay) / <alpha-value>)",
          border: "rgb(var(--editor-border) / <alpha-value>)",
          text: "rgb(var(--editor-text) / <alpha-value>)",
          subtext: "rgb(var(--editor-subtext) / <alpha-value>)",
          muted: "rgb(var(--editor-muted) / <alpha-value>)",
          accent: "rgb(var(--editor-accent) / <alpha-value>)",
          green: "rgb(var(--editor-green) / <alpha-value>)",
          red: "rgb(var(--editor-red) / <alpha-value>)",
          yellow: "rgb(var(--editor-yellow) / <alpha-value>)",
          peach: "rgb(var(--editor-peach) / <alpha-value>)",
          mauve: "rgb(var(--editor-mauve) / <alpha-value>)",
          teal: "rgb(var(--editor-teal) / <alpha-value>)",
          pink: "rgb(var(--editor-pink) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
