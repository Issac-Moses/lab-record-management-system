/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx,css}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        dark: {
          bg: "#0b0f14",
          card: "#111827",
          border: "rgba(0,255,136,0.15)",
        },
        accent: {
          green: "#00ff88",
          "green-dark": "#00c853",
        },
        student: {
          accent: "#3b82f6",
          "accent-dark": "#2563eb",
          border: "rgba(59,130,246,0.2)",
          glow: "rgba(99,102,241,0.35)",
          surface: "#0f172a",
          card: "#1e293b",
          muted: "#334155",
        },
        brand: {
          indigo: "#6366F1",
          teal: "#14B8A6",
          violet: "#A855F7",
          amber: "#F59E0B",
          rose: "#F43F5E",
          emerald: "#10B981",
          sky: "#0EA5E9",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
      },
      backgroundImage: {
        "green-gradient": "linear-gradient(135deg, #00ff88, #00c853)",
        "brand-gradient": "linear-gradient(135deg, #6366F1, #A855F7, #EC4899)",
        "card-shine": "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 60%)",
        "shimmer-overlay": "linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)",
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'flame-flicker': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.15)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'progress-fill': {
          '0%': { width: '0' },
          '100%': { width: 'var(--target-width)' },
        },
        'podium-rise': {
          '0%': { transform: 'translateY(40px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'badge-pop': {
          '0%': { transform: 'scale(0) rotate(-10deg)' },
          '70%': { transform: 'scale(1.1) rotate(2deg)' },
          '100%': { transform: 'scale(1) rotate(0)' },
        },
      },
      animation: {
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'flame-flicker': 'flame-flicker 1.5s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
        'podium-rise': 'podium-rise 0.6s ease-out forwards',
        'badge-pop': 'badge-pop 0.5s ease-out forwards',
      },
    },
  },
  plugins: [],
};
