import type { Metadata } from 'next';
import { FilmStudioHome } from '@/components/studio/FilmStudioHome';
import { LANDING_COPY, landingLang } from '@/components/landing/copy';
import { BRAND_V1 } from '@/lib/brand/v1';

/**
 * /{lang} — the home page IS the chat (docs/DESIGN.md §9), the way gemini.google.com and chatgpt.com open: a visitor
 * can ask something before creating an account, under the guest policy (lib/chat/guestChat), and every paid tool asks
 * them to sign in first. Guests only: middleware sends a signed-in visitor to /{lang}/dashboard — the same studio
 * with their session (lib/routing/landing.ts). Static per locale: the studio reads the session in the browser.
 *
 * The marketing landing moved to /{lang}/landing; this page keeps the site's home metadata (title, description,
 * canonical, hreflang, share card) so search results and shared links are unchanged.
 */
type Props = { params: { locale: string } };

export function generateMetadata({ params }: Props): Metadata {
  const lang = landingLang(params.locale);
  const t = LANDING_COPY[lang];
  return {
    title: { absolute: t.metaTitle },
    description: t.metaDescription,
    alternates: {
      canonical: `/${lang}`,
      languages: { ka: '/ka', en: '/en', ru: '/ru', 'x-default': '/ka' },
    },
    openGraph: {
      type: 'website',
      title: t.metaTitle,
      description: t.metaDescription,
      url: `/${lang}`,
      siteName: 'MyAvatar.ge',
      locale: lang === 'ka' ? 'ka_GE' : lang === 'ru' ? 'ru_RU' : 'en_US',
      images: [{ url: BRAND_V1.og.src, width: BRAND_V1.og.width, height: BRAND_V1.og.height, alt: t.metaTitle }],
    },
    twitter: { card: 'summary_large_image', title: t.metaTitle, description: t.metaDescription, images: [BRAND_V1.og.src] },
  };
}

export default function LocaleHome({ params }: Props) {
  return <FilmStudioHome locale={params.locale} isAuthenticated={false} />;
}
