/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#FFFFFF",
        surface: "#FAFAFA",
        elevated: "#F4F4F5",
        "border-default": "#E4E4E7",
        "text-primary": "#18181B",
        "text-secondary": "#52525B",
        "text-muted": "#71717A",
        "brand-primary": "#2e266f",
        "brand-hover": "#252057",
        "brand-soft": "#f4f2fb",
        "brand-muted": "#e8e4f7",
        "brand-border": "#d4ccf0",
        success: "#16A34A",
        warning: "#CA8A04",
        danger: "#252057",
        info: "#52525B",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
}
