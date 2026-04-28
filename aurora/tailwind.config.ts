import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cosmic base
        void: "#05060A",
        deep: "#0A0B12",
        panel: "#0E1018",
        // Neon accents (named to avoid clobbering Tailwind defaults)
        nebula: {
          cyan: "#22D3EE",
          "cyan-soft": "#67E8F9",
          violet: "#A855F7",
          "violet-soft": "#C084FC",
          lime: "#4ADE80",
          "lime-soft": "#86EFAC",
          rose: "#FB7185",
          amber: "#F59E0B",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        "glow-cyan":
          "0 0 24px rgba(34,211,238,0.45), 0 0 60px rgba(34,211,238,0.2)",
        "glow-violet":
          "0 0 24px rgba(168,85,247,0.45), 0 0 60px rgba(168,85,247,0.2)",
        "glow-lime":
          "0 0 24px rgba(74,222,128,0.45), 0 0 60px rgba(74,222,128,0.2)",
        glass:
          "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.6)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1", filter: "brightness(1)" },
          "50%": { opacity: "0.85", filter: "brightness(1.3)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        drift: {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(30px,-20px) scale(1.05)" },
          "66%": { transform: "translate(-20px,30px) scale(0.95)" },
        },
      },
      animation: {
        shimmer: "shimmer 2.4s linear infinite",
        "pulse-glow": "pulse-glow 2.6s ease-in-out infinite",
        "fade-up": "fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        drift: "drift 24s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
