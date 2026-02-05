import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { IdentityProvider } from "@/lib/identity/IdentityContext";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { ToastProvider } from "@/components/ui/Toast";
import GlobalChatbot from "@/components/GlobalChatbot";
import Navigation from "@/components/Navigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Avatar G - Digital Twin Protocol",
    template: "%s - Avatar G"
  },
  description: "AI-powered digital twin and media generation platform",
  keywords: ["AI", "digital twin", "voice cloning", "avatar", "generative AI"],
  authors: [{ name: "Avatar G Team" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://avatar-g-frontend-v3.vercel.app",
    siteName: "Avatar G",
    images: [{
      url: "/og-image.png",
      width: 1200,
      height: 630,
      alt: "Avatar G - Digital Twin Protocol"
    }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Avatar G - Digital Twin Protocol",
    description: "Create your AI-powered digital twin",
    images: ["/og-image.png"]
  },
  robots: {
    index: true,
    follow: true
  }
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
            <ToastProvider>
              <Navigation />
              {children}
              <GlobalChatbot />
            </ToastProvider>
          </LanguageProvider>
        </IdentityProvider>
      </body>
    </html>
  );
}
