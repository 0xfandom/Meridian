import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0a",
        "ink-s": "#262626",
        "ink-m": "#5a5a5a",
        "ink-f": "#8c8c8c",
        red: "#e11d2a",
        "red-d": "#b01018",
        "red-bg": "#ffecec",
        klein: "#1a1ae5",
        "klein-d": "#1010b0",
        verm: "#ff3b1f",
        hair: "#d8d8d8",
        "hair-lt": "#e6e6e6",
        off: "#f4f4f2",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
