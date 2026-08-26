import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-elevated": "var(--color-surface-elevated)",
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",
        fg: "var(--color-fg)",
        "fg-muted": "var(--color-fg-muted)",
        "fg-subtle": "var(--color-fg-subtle)",
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          fg: "var(--color-primary-fg)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          fg: "var(--color-accent-fg)",
        },
        gold: {
          DEFAULT: "var(--color-gold)",
          fg: "var(--color-gold-fg)",
        },
        urgency: "var(--color-urgency)",
        danger: {
          DEFAULT: "var(--color-danger)",
          fg: "var(--color-danger-fg)",
        },
        rank1: "var(--color-rank-1)",
        rank2: "var(--color-rank-2)",
        rank3: "var(--color-rank-3)",
        frozen: "var(--color-frozen)",
        empty: "var(--color-empty)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        display: ["4.5rem", { lineHeight: "1", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "24px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,.3)",
        md: "0 4px 12px rgba(0,0,0,.4)",
        lg: "0 16px 48px rgba(0,0,0,.5)",
        glow: "0 0 24px rgba(124,58,237,.4)",
      },
      transitionTimingFunction: {
        "ease-out-soft": "cubic-bezier(.22,1,.36,1)",
        "ease-in-soft": "cubic-bezier(.55,0,.68,.15)",
        "ease-spring": "cubic-bezier(.34,1.56,.64,1)",
      },
      transitionDuration: {
        instant: "80ms",
        quick: "150ms",
        base: "220ms",
        slow: "400ms",
      },
      keyframes: {
        "cell-cascade": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "pulse-ring": {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--color-danger)" },
          "50%": { boxShadow: "0 0 0 8px transparent" },
        },
        "flash-border": {
          "0%, 100%": { borderColor: "var(--color-primary)" },
          "50%": { borderColor: "var(--color-accent)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "cell-cascade": "cell-cascade 400ms cubic-bezier(.22,1,.36,1) both",
        "pulse-ring": "pulse-ring 600ms ease-out 2",
        "flash-border": "flash-border 300ms ease-out",
        shimmer: "shimmer 1.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
