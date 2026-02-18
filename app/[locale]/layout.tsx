import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { IdentityProvider } from "@/lib/identity/IdentityContext";
import { ToastProvider } from "@/components/ui/Toast";
import GlobalChatbot from "@/components/GlobalChatbot";
import { Navbar, Footer } from "@/components/layout/AppLayout";
import { publicEnv } from "@/lib/env/public";
import { getMessages } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import { i18n } from "@/i18n.config";

const inter = Inter({ subsets: ["latin"] });

const metadataBaseUrl = publicEnv.NEXT_PUBLIC_APP_URL || "https://avatar-g-frontend-v3.vercel.app";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
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

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = params;
  const safeLocale = i18n.locales.includes(locale as (typeof i18n.locales)[number])
    ? locale
    : i18n.defaultLocale;

  let messages: Record<string, unknown> = {};
  try {
    messages = await getMessages({ locale: safeLocale });
  } catch {
    messages = {};
  }

  return (
    <html lang={safeLocale} className="dark">
      <body className={`${inter.className} bg-[#05070A] text-white antialiased`}>
        <NextIntlClientProvider locale={safeLocale} messages={messages}>
          <IdentityProvider>
            <ToastProvider>
              <Navbar />
              <main className="pt-20">
                {children}
              </main>
              <Footer />
              <GlobalChatbot />
            </ToastProvider>
          </IdentityProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
