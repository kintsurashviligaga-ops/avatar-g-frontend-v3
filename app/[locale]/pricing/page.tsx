import { PricingSection } from '@/components/PricingSection';
import { JsonLd } from '@/components/seo/JsonLd';
import { productSchemas } from '@/lib/seo/schema';
import { PRICING_TIERS } from '@/lib/billing/pricingConfig';

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
