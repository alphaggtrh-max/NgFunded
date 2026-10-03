import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // NGFunded Brand Palette
        background: "#0B080C",
        surface: "#120F13",
        "surface-elevated": "#1A161B",
        border: "#2A2430",
        "border-bright": "#3D3545",
        // Accent
        crimson: {
          DEFAULT: "#E63946",
          muted: "#7A1D23",
          dim: "#3D0E12",
        },
        amber: {
          DEFAULT: "#FFB703",
          muted: "#7A5700",
          dim: "#3D2C00",
        },
        cyan: {
          DEFAULT: "#00F5D4",
          muted: "#006B5E",
          dim: "#003530",
        },
        // Semantic
        success: "#22C55E",
        danger: "#E63946",
        warning: "#FFB703",
        info: "#00F5D4",
        // Text
        "text-primary": "#F0EBF4",
        "text-secondary": "#9B8FA8",
        "text-muted": "#5C5068",
        // Shadcn compat
        foreground: "#F0EBF4",
        card: {
          DEFAULT: "#120F13",
          foreground: "#F0EBF4",
        },
        popover: {
          DEFAULT: "#1A161B",
          foreground: "#F0EBF4",
        },
        primary: {
          DEFAULT: "#E63946",
          foreground: "#F0EBF4",
        },
        secondary: {
          DEFAULT: "#1A161B",
          foreground: "#F0EBF4",
        },
        muted: {
          DEFAULT: "#2A2430",
          foreground: "#9B8FA8",
        },
        accent: {
          DEFAULT: "#00F5D4",
          foreground: "#0B080C",
        },
        destructive: {
          DEFAULT: "#E63946",
          foreground: "#F0EBF4",
        },
        input: "#2A2430",
        ring: "#E63946",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "counter-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out",
        "counter-up": "counter-up 0.2s ease-out",
      },
      boxShadow: {
        "glow-crimson": "0 0 20px rgba(230, 57, 70, 0.3), 0 0 40px rgba(230, 57, 70, 0.1)",
        "glow-cyan": "0 0 20px rgba(0, 245, 212, 0.3), 0 0 40px rgba(0, 245, 212, 0.1)",
        "glow-amber": "0 0 20px rgba(255, 183, 3, 0.3), 0 0 40px rgba(255, 183, 3, 0.1)",
        "glass": "0 8px 32px rgba(0, 0, 0, 0.4)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/forms")],
};

export default config;
