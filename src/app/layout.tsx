import type { Metadata, Viewport } from "next";
import "./globals.css";
import { 
  lineSeedJP, 
  makinasFlat, 
  makinasSquare, 
  zenKakuAntique, 
  zenMaruGothic, 
  zenOldMincho, 
  f18 
} from "./fonts";

// ★追加: PWAおよびApple製デバイス向けの設定
export const metadata: Metadata = {
  title: "ROOTINE",
  description: "ROOTINEで巡ってゆく、私たちの高専祭",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ROOTINE",
  },
};

// ★追加: 意図しない画面の拡大（ズーム）を防ぐ設定
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // すべてのフォント変数を結合
  const fontVariables = `
    ${lineSeedJP.variable} 
    ${makinasFlat.variable} 
    ${makinasSquare.variable} 
    ${zenKakuAntique.variable} 
    ${zenMaruGothic.variable} 
    ${zenOldMincho.variable} 
    ${f18.variable}
  `;

  return (
    <html lang="ja">
      {/* ここに makinasFlat.variable が含まれていることが重要です */}
      <body className={`${fontVariables} antialiased`}>
        {children}
      </body>
    </html>
  );
}