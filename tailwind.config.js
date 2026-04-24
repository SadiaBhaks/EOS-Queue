/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary:   "#080B14",
          secondary: "#0D1220",
          surface:   "#111827",
          elevated:  "#1A2235",
        },
        accent: {
          yellow:  "#F5C518",
          amber:   "#F59E0B",
          cyan:    "#06B6D4",
          green:   "#10B981",
          red:     "#EF4444",
          purple:  "#8B5CF6",
          orange:  "#F97316",
        },
        border: {
          subtle: "#1E2D45",
          normal: "#243352",
          bright: "#334155",
        },
        text: {
          primary:   "#F1F5F9",
          secondary: "#94A3B8",
          muted:     "#475569",
          accent:    "#F5C518",
        },
      },
      fontFamily: {
        mono:    ["'JetBrains Mono'", "monospace"],
        display: ["'Space Grotesk'", "sans-serif"],
        body:    ["'DM Sans'", "sans-serif"],
      },
      animation: {
        "pulse-slow":    "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow":     "spin 8s linear infinite",
        "float":         "float 6s ease-in-out infinite",
        "glow":          "glow 2s ease-in-out infinite alternate",
        "slide-in-up":   "slideInUp 0.4s ease-out",
        "slide-in-right":"slideInRight 0.3s ease-out",
        "fade-in":       "fadeIn 0.5s ease-out",
        "scan":          "scan 3s linear infinite",
      },
      keyframes: {
        float:         { "0%,100%": { transform: "translateY(0px)" }, "50%": { transform: "translateY(-10px)" } },
        glow:          { from: { boxShadow: "0 0 10px #F5C518" }, to: { boxShadow: "0 0 30px #F5C518, 0 0 60px #F5C51840" } },
        slideInUp:     { from: { opacity: 0, transform: "translateY(20px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        slideInRight:  { from: { opacity: 0, transform: "translateX(-20px)" }, to: { opacity: 1, transform: "translateX(0)" } },
        fadeIn:        { from: { opacity: 0 }, to: { opacity: 1 } },
        scan:          { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(100vh)" } },
      },
      boxShadow: {
        "glow-yellow": "0 0 20px rgba(245, 197, 24, 0.3)",
        "glow-cyan":   "0 0 20px rgba(6, 182, 212, 0.3)",
        "glow-green":  "0 0 20px rgba(16, 185, 129, 0.3)",
        "glow-red":    "0 0 20px rgba(239, 68, 68, 0.3)",
        "card":        "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      backgroundImage: {
        "grid-pattern": "linear-gradient(rgba(245,197,24,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(245,197,24,0.03) 1px, transparent 1px)",
        "radial-glow":  "radial-gradient(ellipse at center, rgba(245,197,24,0.08) 0%, transparent 70%)",
      },
      backgroundSize: {
        "grid": "40px 40px",
      },
    },
  },
  plugins: [],
};