import type { Metadata } from 'next';
import { PricingSection } from '@/components/PricingSection';
import { JsonLd } from '@/components/seo/JsonLd';
import { productSchemas } from '@/lib/seo/schema';
import { PRICING_TIERS } from '@/lib/billing/pricingConfig';
import { localeAlternates } from '@/lib/seo/hreflang';

// Iteration 2 — commercial-intent page; was inheriting the homepage title + homepage-level hreflang
// (locale root). Give it a distinct localized title + a self-canonical /pricing hreflang cluster.
const PRICING_TITLE: Record<string, string> = { ka: 'ფასები', en: 'Pricing', ru: 'Цены' };
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: PRICING_TITLE[locale] ?? PRICING_TITLE['en']!, alternates: localeAlternates(locale, '/pricing') };
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
