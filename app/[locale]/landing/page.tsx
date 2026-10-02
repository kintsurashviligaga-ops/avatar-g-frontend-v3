import type { Metadata } from 'next';
import { Landing } from '@/components/landing/Landing';
import { LANDING_COPY, landingLang } from '@/components/landing/copy';
import { pageMetadata } from '@/lib/seo/metadata';

/**
 * /{lang}/landing — the marketing landing. It was the home page until the chat took `/{lang}` (docs/DESIGN.md §9);
 * it stays server-rendered (lib/identity/IdentityContext exempts it from the client-only gate) for crawlers, shared
 * links and the brand reels. Static per locale — nothing here depends on the request.
 */
type Props = { params: { locale: string } };

export function generateMetadata({ params }: Props): Metadata {
  const lang = landingLang(params.locale);
  const t = LANDING_COPY[lang];
  // No " · MyAvatar" suffix: the title already leads with the brand.
  return pageMetadata({ locale: lang, path: '/landing', title: t.metaTitle, description: t.metaDescription, brandSuffix: false });
}

export default function LocaleLanding({ params }: Props) {
  return <Landing locale={params.locale} />;
}
