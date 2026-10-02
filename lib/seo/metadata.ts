/**
 * One builder for a public page's <head>: a localized title and description, the self-canonical + hreflang cluster,
 * and the Open Graph / X cards — so no page ships half a set again.
 *
 * ⚠️ WHY EVERY PAGE CARRIES THE FULL SET. Next REPLACES `openGraph` / `twitter` between segments, it does not merge
 * them: a page that set only a title inherited the [locale] layout's card wholesale — og:title = the HOME title,
 * og:url = the locale root, and the home description — so a shared /en/terms link previewed as the home page.
 *
 * Image URLs stay relative on purpose: Next resolves them against `metadataBase` (the root layout, from SITE_URL),
 * so og:image / twitter:image always render absolute on the site's own origin.
 */
import type { Metadata } from 'next';
import { localeAlternates } from './hreflang';

export type SeoLang = 'ka' | 'en' | 'ru';

/** ka is the middleware default, so anything unknown is ka — never en (the legal pages once split exactly that way). */
export function seoLang(locale: string | null | undefined): SeoLang {
  return locale === 'en' || locale === 'ru' ? locale : 'ka';
}

/** og:site_name — the same name as the WebSite node in the root layout's JSON-LD. */
export const SITE_NAME = 'MyAvatar';

/**
 * The one share card: 1200×630, the transparent rocket + the sheet's lettering on true black, built by
 * `node scripts/brand/build-assets.mjs`. Its text is Latin, so one card serves every language.
 */
export const OG_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: 'MyAvatar.ge — AI Creative Studio',
} as const;

export const OG_LOCALE: Record<SeoLang, string> = { ka: 'ka_GE', en: 'en_US', ru: 'ru_RU' };
const LANGS: readonly SeoLang[] = ['ka', 'en', 'ru'];

type OpenGraph = NonNullable<Metadata['openGraph']>;
type Twitter = NonNullable<Metadata['twitter']>;

/**
 * The share-card blocks on their own — for a layout's defaults, which have no URL of their own (a layout-level og:url
 * would claim the locale root for every page below it). `url` is added by pageMetadata.
 */
export function shareCards(lang: SeoLang, title: string, description: string, url?: string): { openGraph: OpenGraph; twitter: Twitter } {
  return {
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: OG_LOCALE[lang],
      alternateLocale: LANGS.filter((l) => l !== lang).map((l) => OG_LOCALE[l]),
      ...(url ? { url } : {}),
      title,
      description,
      images: [{ ...OG_IMAGE }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  };
}

export interface PageSeo {
  locale: string;
  /** The post-locale path: '' for the locale root, '/terms', '/pricing' … */
  path: string;
  title: string;
  description: string;
  /** Append " · MyAvatar" (the [locale] layout's template). Off for titles that already lead with the brand. */
  brandSuffix?: boolean;
}

export function pageMetadata({ locale, path, title, description, brandSuffix = true }: PageSeo): Metadata {
  const lang = seoLang(locale);
  // `absolute` so the document title, og:title and twitter:title are the same string, not three variants of it.
  const fullTitle = brandSuffix ? `${title} · ${SITE_NAME}` : title;
  const alternates = localeAlternates(lang, path);
  return {
    title: { absolute: fullTitle },
    description,
    alternates,
    ...shareCards(lang, fullTitle, description, alternates.canonical),
  };
}
