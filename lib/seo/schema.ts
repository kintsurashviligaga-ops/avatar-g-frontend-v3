/**
 * Factual schema.org builders (Iteration 5). Every field is derived from real repo data — NO invented
 * aggregateRating/review (manual-penalty risk), NO telephone/street address (not in the repo), NO
 * priceValidUntil/merchant-cart semantics, NO sameAs (no verified owned social profiles). Add such
 * fields only when the owner supplies the real values.
 */
import { SITE_URL, ORG_ID } from './site';

type Json = Record<string, unknown>;

/** FAQPage from a page's own {q,a} items (the Q&A already render on the page → non-deceptive). */
export function faqSchema(items: ReadonlyArray<{ q: string; a: string }>): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
}

export interface TierLike {
  id: string;
  name: string;
  priceUsd: number;
  priceGel: number;
  billing: string;
  creditsIncluded: number;
}

/**
 * One Product per pricing tier, with the price the buyer actually sees (USD display) AND the GEL the
 * wallet/gateway settles — both real, kept in lockstep by pricingConfig. Plain Offer (not AggregateOffer),
 * availability InStock, brand linked to the Organization @id. No priceValidUntil / aggregateRating.
 */
export function productSchemas(tiers: ReadonlyArray<TierLike>, locale: string): Json[] {
  const url = `${SITE_URL}/${locale}/pricing`;
  return tiers.map((t) => ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#${t.id}`,
    name: `MyAvatar ${t.name}`,
    description: `${t.creditsIncluded} credits on the ${t.name} ${t.billing} plan — MyAvatar, the Georgian AI creative studio (video, image, music, voice & avatars).`,
    brand: { '@id': ORG_ID },
    category: 'AI content generation',
    url,
    offers: [
      { '@type': 'Offer', price: String(t.priceUsd), priceCurrency: 'USD', availability: 'https://schema.org/InStock', url },
      { '@type': 'Offer', price: String(t.priceGel), priceCurrency: 'GEL', availability: 'https://schema.org/InStock', url },
    ],
  }));
}

/** Service schema for a single service landing page. */
export function serviceSchema(input: { slug: string; name: string; description: string; locale: string }): Json {
  const url = `${SITE_URL}/${input.locale}/services/${input.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#service`,
    name: input.name,
    description: input.description,
    serviceType: input.name,
    provider: { '@id': ORG_ID },
    areaServed: [{ '@type': 'Country', name: 'Georgia' }, 'Worldwide'],
    inLanguage: ['ka', 'en', 'ru'],
    url,
  };
}

/** BreadcrumbList from an ordered trail of {name, path}. */
export function breadcrumbSchema(trail: ReadonlyArray<{ name: string; path: string }>): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: `${SITE_URL}${c.path}`,
    })),
  };
}

/** ItemList of the service catalog (one entry per landing page). */
export function serviceItemListSchema(input: {
  locale: string;
  name: string;
  services: ReadonlyArray<{ slug: string; name: string }>;
}): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    numberOfItems: input.services.length,
    itemListElement: input.services.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: s.name,
      url: `${SITE_URL}/${input.locale}/services/${s.slug}`,
    })),
  };
}
