import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { IdentityProvider } from "@/lib/identity/IdentityContext";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { ToastProvider } from "@/components/ui/Toast";
import GlobalChatbot from "@/components/GlobalChatbot";
import { Navbar, Footer } from "@/components/layout/AppLayout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Avatar G - AI Media Creation",
    template: "%s - Avatar G"
  },
  description: "Create avatars, video, images, and music with AI",
  keywords: ["AI", "avatar", "video generation", "image generation", "music generation"],
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
      alt: "Avatar G - AI Media Creation"
    }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Avatar G - AI Media Creation",
    description: "Create AI media with Avatar G",
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
              {/* Global Navigation */}
              <Navbar />
              
              {/* Main Content */}
              <main className="pt-20">
                {children}
              </main>
              
              {/* Global Footer */}
              <Footer />
              
              {/* Global AI Assistant */}
              <GlobalChatbot />
            </ToastProvider>
          </LanguageProvider>
        </IdentityProvider>
      </body>
    </html>
  );
}
