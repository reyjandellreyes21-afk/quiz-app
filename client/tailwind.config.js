/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#0B1020",
        surface: "#111827",
        elevated: "#1A2336",
        "border-default": "#263042",
        "text-primary": "#F3F4F6",
        "text-secondary": "#9CA3AF",
        "text-muted": "#6B7280",
        "brand-primary": "#6366F1",
        "brand-hover": "#7C83FF",
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        info: "#38BDF8",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
}

