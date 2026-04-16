/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', "Consolas", "monospace"],
      },
      colors: {
        editor: {
          bg: "#1e1e2e",
          surface: "#181825",
          overlay: "#11111b",
          border: "#313244",
          text: "#cdd6f4",
          subtext: "#a6adc8",
          muted: "#585b70",
          accent: "#89b4fa",
          green: "#a6e3a1",
          red: "#f38ba8",
          yellow: "#f9e2af",
          peach: "#fab387",
          mauve: "#cba6f7",
          teal: "#94e2d5",
          pink: "#f5c2e7",
        },
      },
    },
  },
  plugins: [],
};
