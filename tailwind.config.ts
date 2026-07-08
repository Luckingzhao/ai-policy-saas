import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#14233d",
        mist: "#f5f7fa",
        brand: "#d71920",
        coral: "#e85d4f",
        gold: "#c79a2b"
      },
      boxShadow: {
        soft: "0 18px 55px rgba(20, 35, 61, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
