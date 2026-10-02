import type { Metadata } from 'next';
import { PricingSection } from '@/components/PricingSection';
import { JsonLd } from '@/components/seo/JsonLd';
import { productSchemas } from '@/lib/seo/schema';
import { PRICING_TIERS } from '@/lib/billing/pricingConfig';
import { pageMetadata, seoLang } from '@/lib/seo/metadata';

// A primary conversion and search-landing page: its own localized title and description, the self-canonical /pricing
// hreflang cluster and its own share card. (The metadata used to be split between this page and pricing/layout.tsx —
// written there when this page was a client component — with the two titles disagreeing.)
const PRICING_META: Record<'ka' | 'en' | 'ru', { title: string; description: string }> = {
  ka: { title: 'ფასები და კრედიტები', description: 'გამჭვირვალე pay-as-you-go ფასები. დაიწყე უფასოდ, გადაიხადე მხოლოდ იმაში, რასაც აგენერირებ.' },
  en: { title: 'Pricing & Credits', description: 'Transparent pay-as-you-go pricing. Start free and pay only for what you generate.' },
  ru: { title: 'Цены и кредиты', description: 'Прозрачные цены pay-as-you-go. Начните бесплатно — платите только за то, что генерируете.' },
};
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const lang = seoLang((await params).locale);
  return pageMetadata({ locale: lang, path: '/pricing', ...PRICING_META[lang] });
}

// Server component (Iteration 5): the page has no client logic — it only renders the (client)
// PricingSection — so dropping 'use client' lets it server-render one Product+Offer node per tier
// (USD + GEL, real prices from PRICING_TIERS) alongside the section. A server parent may render a
// client child, so PricingSection is untouched.
export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <div className="bg-transparent" style={{ color: 'var(--color-text)' }}>
      <JsonLd data={productSchemas(PRICING_TIERS, locale)} />
      <div className="pt-8">
        <PricingSection />
      </div>
    </div>
  );
}
