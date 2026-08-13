import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "https://tuptup-midi-studio.bananapink.chatgpt.site";
  const title = "TupTup Studio — Browser MIDI Workstation";
  const description = "专业级浏览器 MIDI 工作站：多音轨编曲、国风公开采样套组、钢琴卷帘、录音、混音与 MIDI 导入导出。";

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: `${origin}/og-studio.png`, width: 1734, height: 907 }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og-studio.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
