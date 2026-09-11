import type { Metadata, Viewport } from "next";
import "./globals.css";
import { uiFont } from "./ui-font";

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
  return (
    <html lang="ja">
      <body className={`${uiFont.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
