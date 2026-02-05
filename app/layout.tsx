import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ToastProvider } from "@/components/Toast";
import GlobalChatbot from "@/components/GlobalChatbot";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Avatar G - AI Universe",
  description: "AI-powered creative platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ka">
      <body className={inter.className}>
        <LanguageProvider>
          <ToastProvider>
            {children}
            <GlobalChatbot />
          </ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
