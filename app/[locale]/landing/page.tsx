import type { Metadata } from 'next';
import { Landing } from '@/components/landing/Landing';
import { LANDING_COPY, landingLang } from '@/components/landing/copy';
import { BRAND_V1 } from '@/lib/brand/v1';

/**
 * /{lang}/landing — the marketing landing. It was the home page until the chat took `/{lang}` (docs/DESIGN.md §9);
 * it stays server-rendered (lib/identity/IdentityContext exempts it from the client-only gate) for crawlers, shared
 * links and the brand reels. Static per locale — nothing here depends on the request.
 */
type Props = { params: { locale: string } };

export function generateMetadata({ params }: Props): Metadata {
  const lang = landingLang(params.locale);
  const t = LANDING_COPY[lang];
  return {
    // `absolute`: the [locale] template would append " · MyAvatar" to a title that already leads with it.
    title: { absolute: t.metaTitle },
    description: t.metaDescription,
    alternates: {
      canonical: `/${lang}/landing`,
      languages: { ka: '/ka/landing', en: '/en/landing', ru: '/ru/landing', 'x-default': '/ka/landing' },
    },
    openGraph: {
      type: 'website',
      title: t.metaTitle,
      description: t.metaDescription,
      url: `/${lang}/landing`,
      siteName: 'MyAvatar.ge',
      locale: lang === 'ka' ? 'ka_GE' : lang === 'ru' ? 'ru_RU' : 'en_US',
      images: [{ url: BRAND_V1.og.src, width: BRAND_V1.og.width, height: BRAND_V1.og.height, alt: t.metaTitle }],
    },
    twitter: { card: 'summary_large_image', title: t.metaTitle, description: t.metaDescription, images: [BRAND_V1.og.src] },
  };
}

export default function LocaleLanding({ params }: Props) {
  return <Landing locale={params.locale} />;
}
