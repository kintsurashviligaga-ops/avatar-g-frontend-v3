import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ToastProvider } from "@/components/Toast";
import { IdentityProvider } from "@/lib/identity/IdentityContext";
import GlobalChatbot from "@/components/GlobalChatbot";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Avatar G - Digital Twin Protocol",
  description: "AI-powered Digital Twin Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ka">
      <body className={inter.className}>
        <IdentityProvider>
          <LanguageProvider>
            <ToastProvider>
              {children}
              <GlobalChatbot />
            </ToastProvider>
          </LanguageProvider>
        </IdentityProvider>
      </body>
    </html>
  );
}
