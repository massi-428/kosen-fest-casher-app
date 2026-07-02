import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // fonts.ts で定義したCSS変数に対応するクラス名を定義
        
        // LINE Seed JP -> class="font-line"
        line: ["var(--font-line-seed)"],
        
        // Makinas -> class="font-makinas-flat", "font-makinas-square"
        "makinas-flat": ["var(--font-makinas-flat)"],
        "makinas-square": ["var(--font-makinas-square)"],

        // Zen Kaku Gothic Antique -> class="font-zen-kaku"
        "zen-kaku": ["var(--font-zen-kaku)"],

        // Zen Maru Gothic -> class="font-zen-maru"
        "zen-maru": ["var(--font-zen-maru)"],

        // Zen Old Mincho -> class="font-zen-mincho"
        "zen-mincho": ["var(--font-zen-mincho)"],

        // F1.8 (Digital) -> class="font-f18"
        f18: ["var(--font-f18)"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
export default config;