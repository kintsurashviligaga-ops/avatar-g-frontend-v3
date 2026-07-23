import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocalizedMeta, getAgentIdForService } from '@/lib/services/metadata';
import { JsonLd } from '@/components/seo/JsonLd';
import { serviceSchema, breadcrumbSchema } from '@/lib/seo/schema';
import ServicePageClient from './ServicePageClient';

/** Localized "Services" breadcrumb crumb (leaf uses the service's own headline). */
const SERVICES_CRUMB: Record<string, string> = { ka: 'სერვისები', en: 'Services', ru: 'Сервисы' };

type ServiceDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

const SHORT_SLUGS = [
  'avatar', 'video', 'editing', 'music', 'photo', 'image',
  'media', 'text', 'prompt', 'visual-intel', 'workflow', 'shop', 'agent-g',
  'software', 'business', 'tourism', 'game', 'interior',
  'prompt-builder', 'terminal', 'content-writer', 'podcast', 'character', 'event', 'voice',
] as const;

export async function generateStaticParams() {
  return SHORT_SLUGS.map((slug) => ({ slug }));
}

const NOT_FOUND_TEXT: Record<string, { title: string; back: string }> = {
  en: { title: 'Service not found', back: 'Back to Services' },
  ka: { title: 'სერვისი ვერ მოიძებნა', back: 'სერვისებზე დაბრუნება' },
  ru: { title: 'Сервис не найден', back: 'Назад к сервисам' },
};

const OG_LOCALE: Record<string, string> = { ka: 'ka_GE', en: 'en_US', ru: 'ru_RU' };

/**
 * Per-service metadata. Previously every /services/[slug] page inherited the
 * generic locale-layout title, so all 42 (14 services × 3 locales) URLs the
 * sitemap advertises shared one title + description — a duplicate-content
 * signal that wastes the ranking value of the sitemap work. Here each page
 * gets its own localized headline (the locale layout wraps it as
 * "<headline> - Avatar G"), description, a self-referential canonical (correct
 * on a leaf route — it won't be inherited), and matching OG/Twitter cards.
 * Unknown slugs render a "not found" state, so they are marked noindex.
 *
 * Note: Next REPLACES (does not deep-merge) `openGraph` across segments, so the
 * shared brand card must be re-declared here or these pages would lose it.
 */
export async function generateMetadata({ params }: ServiceDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const meta = getLocalizedMeta(slug, locale);
  const canonical = `/${locale}/services/${slug}`;

  if (!meta) {
    const text = NOT_FOUND_TEXT[locale] ?? NOT_FOUND_TEXT['en']!;
    return { title: text.title, robots: { index: false, follow: true } };
  }

  return {
    title: meta.headline,
    description: meta.description,
    keywords: meta.features,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: meta.headline,
      description: meta.description,
      url: canonical,
      siteName: 'MyAvatar',
      locale: OG_LOCALE[locale] ?? 'en_US',
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: meta.headline }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.headline,
      description: meta.description,
      images: ['/og-image.png'],
    },
  };
}

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { locale, slug } = await params;
  const meta = getLocalizedMeta(slug, locale);

  if (!meta) {
    const text = NOT_FOUND_TEXT[locale] ?? NOT_FOUND_TEXT['en']!;
    return (
      <section className="min-h-screen flex items-center justify-center bg-transparent" style={{ color: 'var(--color-text)' }}>
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
            <span className="text-3xl" style={{ color: 'var(--color-text-tertiary)' }}>?</span>
          </div>
          <h1 className="text-2xl font-semibold">{text.title}</h1>
          <Link href={`/${locale}/services`} className="text-sm transition-colors" style={{ color: 'var(--color-accent)' }}>
            ← {text.back}
          </Link>
        </div>
      </section>
    );
  }

  const agentId = getAgentIdForService(slug);

  // Structured data — only for a KNOWN slug (guarded by the !meta return above), so the noindex
  // not-found branch never emits it. Server-rendered, additive, links to the root Organization @id.
  const structuredData = [
    serviceSchema({ slug, name: meta.headline, description: meta.description, locale }),
    breadcrumbSchema([
      { name: 'MyAvatar', path: `/${locale}` },
      { name: SERVICES_CRUMB[locale] ?? SERVICES_CRUMB.en!, path: `/${locale}/services` },
      { name: meta.headline, path: `/${locale}/services/${slug}` },
    ]),
  ];

  return (
    <>
      <JsonLd data={structuredData} />
      <ServicePageClient
        serviceId={slug}
        serviceName={meta.headline}
        serviceIcon={meta.icon}
        agentId={agentId}
        locale={locale}
        features={meta.features}
        description={meta.description}
      />
    </>
  );
}
