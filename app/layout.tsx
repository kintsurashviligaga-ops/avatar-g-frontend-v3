import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { IdentityProvider } from "@/lib/identity/IdentityContext";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import GlobalChatbot from "@/components/GlobalChatbot";
import Navigation from "@/components/Navigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Avatar G - Digital Twin Protocol",
  description: "AI-powered digital twin and media generation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#05070A] text-white antialiased`}>
        <IdentityProvider>
          <LanguageProvider>
            <Navigation />
            {children}
            <GlobalChatbot />
          </LanguageProvider>
        </IdentityProvider>
      </body>
    </html>
  );
}
