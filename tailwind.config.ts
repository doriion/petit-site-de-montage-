import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          900: "#0a0a0f",
          800: "#11111a",
          700: "#1a1a27",
          600: "#262635",
        },
        beat: {
          DEFAULT: "#ff2d6f",
          soft: "#ff6b9d",
        },
        accent: "#5eead4",
      },
      keyframes: {
        flash: {
          "0%": { opacity: "0.9" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        flash: "flash 220ms ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
