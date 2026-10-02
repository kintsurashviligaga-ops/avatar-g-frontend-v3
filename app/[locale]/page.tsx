import type { Metadata } from 'next';
import { FilmStudioHome } from '@/components/studio/FilmStudioHome';
import { LANDING_COPY, landingLang } from '@/components/landing/copy';
import { pageMetadata } from '@/lib/seo/metadata';

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
  // The title already leads with the brand — no " · MyAvatar" suffix.
  return pageMetadata({ locale: lang, path: '', title: t.metaTitle, description: t.metaDescription, brandSuffix: false });
}

export default function LocaleHome({ params }: Props) {
  return <FilmStudioHome locale={params.locale} isAuthenticated={false} />;
}
