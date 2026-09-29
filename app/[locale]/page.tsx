import type { Metadata } from 'next';
import { Landing } from '@/components/landing/Landing';
import { LANDING_COPY, landingLang } from '@/components/landing/copy';
import { BRAND_V1 } from '@/lib/brand/v1';

/**
 * /{lang} — the marketing landing (docs/DESIGN.md). Guests only: middleware sends a signed-in visitor straight
 * to /{lang}/dashboard (lib/routing/landing.ts). Static per locale — nothing here depends on the request.
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

export default function LocaleLanding({ params }: Props) {
  return <Landing locale={params.locale} />;
}
