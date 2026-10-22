import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080a0f",
        panel: "#0f131c",
        panel2: "#151a26",
        line: "#252c3b",
        gold: "#f5b544",
        violet: "#a78bfa",
        teal: "#5eead4",
      },
      fontFamily: {
        display: ["Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["Segoe UI", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(245, 181, 68, 0.16)",
        panel: "0 18px 50px rgba(0, 0, 0, 0.45)",
      },
      keyframes: {
        pop: {
          "0%": { transform: "scale(0.7)", opacity: "0" },
          "70%": { transform: "scale(1.06)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        pulseSoft: {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        spinDie: {
          "0%": { transform: "rotate(0deg) scale(0.9)" },
          "60%": { transform: "rotate(520deg) scale(1.08)" },
          "100%": { transform: "rotate(720deg) scale(1)" },
        },
      },
      animation: {
        pop: "pop 260ms ease-out",
        float: "float 5s ease-in-out infinite",
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite",
        spinDie: "spinDie 900ms cubic-bezier(.2,.8,.2,1)",
      },
    },
  },
  plugins: [],
};
export default config;
