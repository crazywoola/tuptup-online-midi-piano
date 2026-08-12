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
  const origin = host ? `${protocol}://${host}` : "https://tuptup-midi-piano.bananapink.chatgpt.site";
  const title = "TupTup Piano — Online MIDI Instrument";
  const description = "连接 TupTup TS01-MIDI，在浏览器中即刻演奏低延迟在线钢琴。";

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: `${origin}/og.png`, width: 1672, height: 941 }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
