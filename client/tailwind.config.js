/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#f8fafc",
        surface: "#f1f5f9",
        elevated: "#e2e8f0",
        "border-default": "#e2e8f0",
        "text-primary": "#0f172a",
        "text-secondary": "#475569",
        "text-muted": "#64748b",
        "brand-primary": "#1e1b4b",
        "brand-hover": "#172554",
        "brand-accent": "#0ea5e9",
        "brand-soft": "#eef2ff",
        "brand-muted": "#e0e7ff",
        "brand-border": "#c7d2fe",
        success: "#16A34A",
        warning: "#CA8A04",
        danger: "#b91c1c",
        info: "#52525B",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
}
