import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Server-component layout that exists ONLY to attach localized SEO metadata to
 * the pricing route. The page itself is a Client Component (`'use client'`) and
 * therefore cannot export `generateMetadata`; a sibling layout can, and simply
 * passes children through unchanged. pricing/ has no sub-routes, so this scopes
 * cleanly to the pricing page alone.
 *
 * Before this, /pricing inherited the generic locale-layout title — identical
 * across ka/en/ru and always Georgian even on /en and /ru. Pricing is a primary
 * conversion + search-landing page, so it gets its own localized title,
 * description, self-canonical and social cards.
 */
const PRICING_META: Record<string, { title: string; description: string }> = {
  ka: { title: 'ფასები და კრედიტები', description: 'გამჭვირვალე pay-as-you-go ფასები. დაიწყე უფასოდ, გადაიხადე მხოლოდ იმაში, რასაც აგენერირებ.' },
  en: { title: 'Pricing & Credits', description: 'Transparent pay-as-you-go pricing. Start free and pay only for what you generate.' },
  ru: { title: 'Цены и кредиты', description: 'Прозрачные цены pay-as-you-go. Начните бесплатно — платите только за то, что генерируете.' },
};
const OG_LOCALE: Record<string, string> = { ka: 'ka_GE', en: 'en_US', ru: 'ru_RU' };

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  const m = PRICING_META[locale] ?? PRICING_META['en']!;
  const canonical = `/${locale}/pricing`;
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: m.title,
      description: m.description,
      url: canonical,
      siteName: 'MyAvatar',
      locale: OG_LOCALE[locale] ?? 'en_US',
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: m.title }],
    },
    twitter: { card: 'summary_large_image', title: m.title, description: m.description, images: ['/og-image.png'] },
  };
}

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
