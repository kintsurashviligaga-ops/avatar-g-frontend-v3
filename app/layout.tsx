import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Avatar G - Georgian AI Content Platform",
  description: "პროფესიონალური AI ინსტრუმენტები ქართულ ენაზე",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka" className="dark">
      <body className={`${inter.className} antialiased`}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
