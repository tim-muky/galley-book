import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design system: "The Culinary Gallery"
        surface: "#F9F9F9",
        "surface-low": "#F3F3F4",
        "surface-lowest": "#FFFFFF",
        "surface-highest": "#E2E2E2",
        primary: "#000000",
        "primary-container": "#3A3C3E",
        "on-primary": "#E2E2E5",
        "on-surface": "#1A1C1C",
        "on-surface-variant": "#474747",
        anthracite: "#252729",
        "outline-variant": "#C6C6C6",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontWeight: {
        thin: "100",
        light: "300",
        normal: "400",
        semibold: "600",
      },
      fontSize: {
        "display-lg": ["3.5rem", { lineHeight: "1.1", fontWeight: "100" }],
        "headline-md": ["1.75rem", { lineHeight: "1.2", fontWeight: "300" }],
        "title-sm": ["1rem", { lineHeight: "1.4", fontWeight: "600" }],
        "body-md": ["0.875rem", { lineHeight: "1.6", fontWeight: "300" }],
        "label-md": ["0.75rem", { lineHeight: "1.4", fontWeight: "400" }],
      },
      borderRadius: {
        sm: "0.5rem",
        md: "1.5rem",
        lg: "2rem",
        full: "9999px",
      },
      boxShadow: {
        ambient:
          "0 12px 40px 0 rgba(26, 28, 28, 0.04)",
        float:
          "0 12px 40px 0 rgba(26, 28, 28, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
