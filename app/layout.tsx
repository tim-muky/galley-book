import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["100", "300", "400", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Galley Book",
  description: "Your family's private recipe collection",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-surface antialiased">{children}</body>
    </html>
  );
}
