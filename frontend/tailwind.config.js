/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07090d",
        panel: "#0d1117",
        panel2: "#131a23",
        edge: "#1f2937",
        accent: "#22d3ee",
        accent2: "#a855f7",
        bull: "#10b981",
        bear: "#ef4444",
        mute: "#64748b",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
