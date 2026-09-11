import localFont from "next/font/local";

export const uiFont = localFont({
  src: [
    { path: "./font/LINE_Seed_JP/LINESeedJP_OTF_Th.woff2", weight: "100", style: "normal" },
    { path: "./font/LINE_Seed_JP/LINESeedJP_OTF_Rg.woff2", weight: "400", style: "normal" },
    { path: "./font/LINE_Seed_JP/LINESeedJP_OTF_Bd.woff2", weight: "700", style: "normal" },
    { path: "./font/LINE_Seed_JP/LINESeedJP_OTF_Eb.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-line-seed",
  display: "swap",
  fallback: ["Yu Gothic", "Hiragino Kaku Gothic ProN", "sans-serif"],
});
