import type { Config } from "tailwindcss";

/**
 * Nexlar — Tailwind expõe os SEMÂNTICOS de tokens.css.
 * Regra: componentes usam classes semânticas (bg-surface, text-muted,
 * bg-accent...), nunca cores primitivas cruas.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          sunken: "var(--surface-sunken)",
          hover: "var(--surface-hover)",
        },
        text: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
          subtle: "var(--text-subtle)",
          "on-brand": "var(--text-on-brand)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          active: "var(--primary-active)",
          soft: "var(--primary-soft)",
          on: "var(--primary-on)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          active: "var(--accent-active)",
          soft: "var(--accent-soft)",
          on: "var(--accent-on)",
        },
        success: { DEFAULT: "var(--success)", fg: "var(--success-fg)", soft: "var(--success-soft)" },
        warning: { DEFAULT: "var(--warning)", fg: "var(--warning-fg)", soft: "var(--warning-soft)" },
        danger: { DEFAULT: "var(--danger)", fg: "var(--danger-fg)", soft: "var(--danger-soft)" },
        info: { DEFAULT: "var(--info)", fg: "var(--info-fg)", soft: "var(--info-soft)" },
        highlight: {
          DEFAULT: "var(--highlight)",
          fg: "var(--highlight-fg)",
          soft: "var(--highlight-soft)",
          strong: "var(--highlight-strong)",
          border: "var(--highlight-border)",
        },
      },
      fontFamily: {
        sans: "var(--font-sans)".split(","),
      },
      fontSize: {
        display: ["var(--text-display)", { lineHeight: "var(--leading-tight)", letterSpacing: "var(--tracking-tight)", fontWeight: "800" }],
        h1: ["var(--text-h1)", { lineHeight: "var(--leading-tight)", letterSpacing: "var(--tracking-tight)", fontWeight: "700" }],
        h2: ["var(--text-h2)", { lineHeight: "var(--leading-snug)", fontWeight: "700" }],
        h3: ["var(--text-h3)", { lineHeight: "var(--leading-snug)", fontWeight: "600" }],
        "body-lg": ["var(--text-body-lg)", { lineHeight: "var(--leading-normal)" }],
        body: ["var(--text-body)", { lineHeight: "var(--leading-normal)" }],
        "body-sm": ["var(--text-body-sm)", { lineHeight: "var(--leading-normal)" }],
        label: ["var(--text-label)", { lineHeight: "var(--leading-snug)", fontWeight: "600" }],
        caption: ["var(--text-caption)", { lineHeight: "var(--leading-snug)" }],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        focus: "var(--shadow-focus)",
      },
      maxWidth: {
        container: "var(--container-max)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
      },
    },
  },
  plugins: [],
};

export default config;
