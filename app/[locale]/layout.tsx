import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicEnv } from "@/lib/env/public";
import { getMessages, setRequestLocale } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import { i18n } from "@/i18n.config";

const metadataBaseUrl = publicEnv.NEXT_PUBLIC_APP_URL || "https://avatar-g-frontend-v3.vercel.app";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/favicon.ico',
    shortcut: '/icons/favicon.ico',
    apple: '/icons/icon-180x180.png',
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
      url: "/brand/logo-primary-transparent.png",
      width: 512,
      height: 512,
      alt: "Avatar G - AI მედია პლატფორმა"
    }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Avatar G - AI მედია პლატფორმა",
    description: "AI მედიის შექმნა Avatar G-სთან ერთად",
    images: ["/brand/logo-primary-transparent.png"]
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
      <div className="font-sans min-h-screen flex flex-col items-center justify-center bg-transparent text-white px-6 ag-noise">
        <div className="ag-surface-hero rounded-3xl px-8 py-10 text-center max-w-xl border border-white/15">
          <h1 className="text-2xl font-bold mb-2">Avatar G</h1>
          <p className="text-white/70">Sorry, the site is temporarily unavailable in this language.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans ag-noise">
      <NextIntlClientProvider locale={safeLocale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </div>
  );
}
