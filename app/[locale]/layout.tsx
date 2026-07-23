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

// Localized SEO copy per market. The metadata was previously HARD-CODED Georgian, so /en and /ru
// pages served Georgian titles/descriptions/OpenGraph — a direct international-SEO loss (Iteration 2).
// generateMetadata now emits the right language per locale + an hreflang cluster (en/ka/ru + x-default).
type LocaleSeo = { title: string; description: string; ogDesc: string; keywords: string[]; ogLocale: string };
const LOCALE_SEO: Record<string, LocaleSeo> = {
  ka: {
    title: "MyAvatar — AI ვიდეო, მუსიკა და სურათების გენერაცია",
    description: "საქართველოს პირველი AI კონტენტის შემქმნელი პლატფორმა — შექმენი ვიდეო, მუსიკა და სურათები ხელოვნური ინტელექტით, წამებში.",
    ogDesc: "საქართველოს პირველი AI კონტენტის შემქმნელი პლატფორმა.",
    keywords: ["AI ვიდეო", "AI მუსიკა", "AI სურათი", "ხელოვნური ინტელექტი", "AI კონტენტი", "MyAvatar", "ვიდეოს გენერაცია"],
    ogLocale: "ka_GE",
  },
  en: {
    title: "MyAvatar — AI Video, Music & Image Generation",
    description: "Create studio-quality videos, music, and images with AI in seconds. The AI content platform born in Georgia — now for creators worldwide.",
    ogDesc: "Create studio-quality video, music, and images with AI in seconds.",
    keywords: ["AI video", "AI music", "AI image generator", "AI content creator", "text to video", "MyAvatar", "video generation"],
    ogLocale: "en_US",
  },
  ru: {
    title: "MyAvatar — Генерация видео, музыки и изображений с ИИ",
    description: "Создавайте видео, музыку и изображения студийного качества с помощью ИИ за секунды. Первая AI-платформа для контента из Грузии.",
    ogDesc: "Создавайте видео, музыку и изображения студийного качества с помощью ИИ.",
    keywords: ["ИИ видео", "ИИ музыка", "ИИ генератор изображений", "AI контент", "текст в видео", "MyAvatar", "генерация видео"],
    ogLocale: "ru_RU",
  },
};
const OG_ALTERNATE: Record<string, string[]> = { ka: ["en_US", "ru_RU"], en: ["ka_GE", "ru_RU"], ru: ["ka_GE", "en_US"] };

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale = i18n.locales.includes(params.locale as (typeof i18n.locales)[number]) ? params.locale : "ka";
  const seo: LocaleSeo = LOCALE_SEO[locale] ?? LOCALE_SEO.ka!;
  const base = metadataBaseUrl;
  return {
    metadataBase: new URL(base),
    manifest: '/manifest.json',
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'MyAvatar' },
    formatDetection: { telephone: false },
    icons: { icon: '/icons/favicon.ico', shortcut: '/icons/favicon.ico', apple: '/apple-touch-icon.png' },
    title: { default: seo.title, template: "%s · MyAvatar" },
    description: seo.description,
    keywords: seo.keywords,
    authors: [{ name: "MyAvatar" }],
    // hreflang cluster (HTML). The homepage set is return-tag-correct across all three locales; precise
    // PER-PAGE hreflang for sub-pages is emitted authoritatively via the sitemap (app/sitemap.ts). No
    // fixed canonical here — a layout-level canonical would wrongly collapse every sub-page to the locale root.
    alternates: {
      languages: {
        en: `${base}/en`,
        ka: `${base}/ka`,
        ru: `${base}/ru`,
        "x-default": `${base}/ka`,
      },
    },
    openGraph: {
      type: "website",
      locale: seo.ogLocale,
      alternateLocale: OG_ALTERNATE[locale] ?? OG_ALTERNATE.ka!,
      url: `${base}/${locale}`,
      siteName: "MyAvatar",
      title: seo.title,
      description: seo.ogDesc,
      // 1200×630 landscape card — summary_large_image / Facebook / LinkedIn crop a 512² square badly.
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: seo.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.ogDesc,
      images: ["/og-image.png"],
    },
    robots: { index: true, follow: true },
  };
}

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
          <h1 className="text-2xl font-bold mb-2">MyAvatar</h1>
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
