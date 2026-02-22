import type { Metadata } from "next";
import "./globals.css";
import { IdentityProvider } from "@/lib/identity/IdentityContext";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { ToastProvider } from "@/components/ui/Toast";
import GlobalChatbot from "@/components/GlobalChatbot";
import { Navbar, Footer } from "@/components/layout/AppLayout";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { i18n } from "@/i18n.config";
import { logStartupEnvValidation } from "@/lib/env/startupValidation";

const metadataBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://myavatar.ge";

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  icons: {
    icon: '/icon',
    shortcut: '/icon',
    apple: '/icon',
  },
  title: {
    default: "Avatar G - AI მედია პლატფორმა",
    template: "%s - Avatar G"
  },
  description: "შექმენი ავატარები, ვიდეო, სურათები და მუსიკა AI-ით",
  keywords: ["AI", "ავატარი", "ვიდეო გენერაცია", "სურათის გენერაცია", "მუსიკის გენერაცია"],
  authors: [{ name: "Avatar G Team" }],
  openGraph: {
    type: "website",
    locale: "ka_GE",
    url: metadataBaseUrl,
    siteName: "Avatar G",
    images: [{
      url: "/og-image.png",
      width: 1200,
      height: 630,
      alt: "Avatar G - AI მედია პლატფორმა"
    }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Avatar G - AI მედია პლატფორმა",
    description: "AI მედიის შექმნა Avatar G-სთან ერთად",
    images: ["/og-image.png"]
  },
  robots: {
    index: true,
    follow: true
  }
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  try {
    logStartupEnvValidation();
  } catch {
    // Never block runtime rendering because of env startup checks.
  }

  let locale: string = i18n.defaultLocale;
  let messages: Record<string, unknown> = {};

  try {
    const detectedLocale = await getLocale();
    locale = i18n.locales.includes(detectedLocale as (typeof i18n.locales)[number])
      ? detectedLocale
      : i18n.defaultLocale;
    messages = await getMessages();
  } catch {
    locale = i18n.defaultLocale;
    messages = {};
  }

  return (
    <html lang={locale} className="dark">
      <body className="font-sans bg-[#05070A] text-white antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <IdentityProvider>
            <LanguageProvider>
              <ToastProvider>
                <Navbar />
                <main className="pt-20">
                  {children}
                </main>
                <Footer />
                <GlobalChatbot />
              </ToastProvider>
            </LanguageProvider>
          </IdentityProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
