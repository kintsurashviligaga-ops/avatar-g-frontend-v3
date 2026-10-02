import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMessages, setRequestLocale } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import { i18n } from "@/i18n.config";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { PageTransitionWrapper } from "@/components/layout/PageTransitionWrapper";
import { AppProviders } from "@/components/providers/AppProviders";
import HtmlLangSync from "@/components/i18n/HtmlLangSync";
import { seoLang, shareCards } from "@/lib/seo/metadata";

// ISR (Iteration 3): the previous `force-dynamic` + `revalidate=0` forced `Cache-Control: no-store` on
// the ENTIRE locale subtree — even the user-agnostic, build-prerendered marketing/pricing pages — so
// every international request paid a full origin round-trip (single iad1 region). Removing them lets
// each page render per its real needs: pages with no dynamic API become ISR (cacheable at the edge,
// regenerated hourly + stale-while-revalidate); any page that reads cookies/session server-side still
// auto-opts into dynamic rendering. Auth'd pages are client-hydrated shells (no per-user SSR), so
// caching their shell is safe. `setRequestLocale` (below) is what enables this static rendering.
export const revalidate = 3600;

// Localized SEO copy per market. The metadata was previously HARD-CODED Georgian, so /en and /ru
// pages served Georgian titles/descriptions/OpenGraph — a direct international-SEO loss (Iteration 2).
// generateMetadata emits the right language per locale (each public page adds its own hreflang cluster).
type LocaleSeo = { title: string; description: string; ogDesc: string; keywords: string[] };
const LOCALE_SEO: Record<string, LocaleSeo> = {
  ka: {
    title: "MyAvatar — AI ვიდეო, მუსიკა და სურათების გენერაცია",
    description: "საქართველოს პირველი AI კონტენტის შემქმნელი პლატფორმა — შექმენი ვიდეო, მუსიკა და სურათები ხელოვნური ინტელექტით, წამებში.",
    ogDesc: "საქართველოს პირველი AI კონტენტის შემქმნელი პლატფორმა.",
    keywords: ["AI ვიდეო", "AI მუსიკა", "AI სურათი", "ხელოვნური ინტელექტი", "AI კონტენტი", "MyAvatar", "ვიდეოს გენერაცია"],
  },
  en: {
    title: "MyAvatar — AI Video, Music & Image Generation",
    description: "Create studio-quality videos, music, and images with AI in seconds. The AI content platform born in Georgia — now for creators worldwide.",
    ogDesc: "Create studio-quality video, music, and images with AI in seconds.",
    keywords: ["AI video", "AI music", "AI image generator", "AI content creator", "text to video", "MyAvatar", "video generation"],
  },
  ru: {
    title: "MyAvatar — Генерация видео, музыки и изображений с ИИ",
    description: "Создавайте видео, музыку и изображения студийного качества с помощью ИИ за секунды. Первая AI-платформа для контента из Грузии.",
    ogDesc: "Создавайте видео, музыку и изображения студийного качества с помощью ИИ.",
    keywords: ["ИИ видео", "ИИ музыка", "ИИ генератор изображений", "AI контент", "текст в видео", "MyAvatar", "генерация видео"],
  },
};

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const lang = seoLang(params.locale);
  const seo: LocaleSeo = LOCALE_SEO[lang] ?? LOCALE_SEO.ka!;
  return {
    // metadataBase, appleWebApp and formatDetection come from the root layout; the manifest and the icons from the
    // app/ file conventions. ⚠️ Declaring them again here is how this subtree served its OWN manifest (/manifest.json)
    // and an icon list that made Next drop app/icon.png — and how its metadataBase drifted from SITE_URL.
    title: { default: seo.title, template: "%s · MyAvatar" },
    description: seo.description,
    keywords: seo.keywords,
    authors: [{ name: "MyAvatar" }],
    // ⚠️ No `alternates` and no og:url at this level. Both are per-URL facts, and a layout's values are inherited by
    // every page under it that does not set its own: the old homepage hreflang cluster and og:url = /{locale} told
    // crawlers that /ka/support (and every page like it) was the locale root. Public pages set the full set
    // themselves (lib/seo/metadata.ts pageMetadata); the share card (1200×630) is the default for the rest.
    ...shareCards(lang, seo.title, seo.ogDesc),
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
          <h1 className="text-2xl font-bold mb-2">MyAvatar.ge</h1>
          <p className="text-white/70">Sorry, the site is temporarily unavailable in this language.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans ag-noise ag-silver-neon-overlay">
      <NextIntlClientProvider locale={safeLocale} messages={messages}>
        <HtmlLangSync locale={safeLocale} />
        <QueryProvider>
          <AppProviders>
            <PageTransitionWrapper>{children}</PageTransitionWrapper>
          </AppProviders>
        </QueryProvider>
      </NextIntlClientProvider>
    </div>
  );
}
