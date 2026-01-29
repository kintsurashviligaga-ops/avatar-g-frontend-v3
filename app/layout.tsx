import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Avatar G - პერსონალური AI ეკოსისტემა",
  description: "პირველი ქართული AI ეკოსისტემა. ლოკალური. უსაფრთხო. გონიერი.",
  keywords: ["AI", "Georgia", "Avatar", "Agent G", "ეკოსისტემა"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ka" className={inter.variable}>
      <body className="antialiased bg-black text-white font-sans">
        {children}
      </body>
    </html>
  );
}
