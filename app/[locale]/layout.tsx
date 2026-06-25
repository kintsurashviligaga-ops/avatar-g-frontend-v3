import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicEnv } from "@/lib/env/public";
import { getMessages, setRequestLocale } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import { i18n } from "@/i18n.config";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { PageTransitionWrapper } from "@/components/layout/PageTransitionWrapper";
import { AppProviders } from "@/components/providers/AppProviders";

const metadataBaseUrl = publicEnv.NEXT_PUBLIC_APP_URL || "https://avatar-g-frontend-v3.vercel.app";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MyAvatar.ge',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/icons/favicon.ico',
    shortcut: '/icons/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  title: {
    default: "MyAvatar.ge — AI ვიდეო, მუსიკა და სურათების გენერაცია",
    template: "%s · MyAvatar.ge"
  },
  description: "საქართველოს პირველი AI კონტენტის შემქმნელი პლატფორმა — შექმენი ვიდეო, მუსიკა და სურათები ხელოვნური ინტელექტით, წამებში.",
  keywords: ["AI ვიდეო", "AI მუსიკა", "AI სურათი", "ხელოვნური ინტელექტი", "AI კონტენტი", "MyAvatar", "ვიდეოს გენერაცია"],
  authors: [{ name: "MyAvatar.ge" }],
  openGraph: {
    type: "website",
    locale: "ka_GE",
    alternateLocale: ["en_US", "ru_RU"],
    url: metadataBaseUrl,
    siteName: "MyAvatar.ge",
    title: "MyAvatar.ge — AI ვიდეო, მუსიკა და სურათების გენერაცია",
    description: "საქართველოს პირველი AI კონტენტის შემქმნელი პლატფორმა.",
    images: [{
      // 1200×630 landscape card — `summary_large_image` and Facebook/LinkedIn
      // crop a 512² square badly. The dedicated /og-image.png is the right ratio.
      url: "/og-image.png",
      width: 1200,
      height: 630,
      alt: "MyAvatar.ge — AI კონტენტის შემქმნელი პლატფორმა"
    }]
  },
  twitter: {
    card: "summary_large_image",
    title: "MyAvatar.ge — AI ვიდეო, მუსიკა და სურათები",
    description: "საქართველოს პირველი AI კონტენტის შემქმნელი პლატფორმა.",
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
  const isSupportedLocale = i18n.locales.includes(locale as (typeof i18n.locales)[number]);
  if (!isSupportedLocale) {
    notFound();
  }

  setRequestLocale(locale);

  const safeLocale = locale;
  let messages: Record<string, unknown> | null = null;
  let messageError = false;
  try {
    messages = await getMessages({ locale: safeLocale });
  } catch (err: unknown) {
    messageError = true;
    console.error(err);
  }

  if (messageError || !messages) {
    // Minimal SSR fallback if translations fail
    return (
      <div className="font-sans min-h-screen flex flex-col items-center justify-center bg-transparent text-white px-6 ag-noise ag-silver-neon-overlay">
        <div className="ag-surface-hero rounded-3xl px-8 py-10 text-center max-w-xl border border-white/15">
          <h1 className="text-2xl font-bold mb-2">Avatar G</h1>
          <p className="text-white/70">Sorry, the site is temporarily unavailable in this language.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans ag-noise ag-silver-neon-overlay">
      <NextIntlClientProvider locale={safeLocale} messages={messages}>
        <QueryProvider>
          <AppProviders>
            <PageTransitionWrapper>{children}</PageTransitionWrapper>
          </AppProviders>
        </QueryProvider>
      </NextIntlClientProvider>
    </div>
  );
}
