import Link from 'next/link';
import { getLocalizedMeta, getAgentIdForService } from '@/lib/services/metadata';
import ServicePageClient from './ServicePageClient';

type ServiceDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

const SHORT_SLUGS = [
  'avatar', 'video', 'editing', 'music', 'photo', 'image',
  'media', 'text', 'prompt', 'visual-intel', 'workflow', 'shop', 'agent-g',
  'software', 'business', 'tourism', 'next',
] as const;

export async function generateStaticParams() {
  return SHORT_SLUGS.map((slug) => ({ slug }));
}

const NOT_FOUND_TEXT: Record<string, { title: string; back: string }> = {
  en: { title: 'Service not found', back: 'Back to Services' },
  ka: { title: 'სერვისი ვერ მოიძებნა', back: 'სერვისებზე დაბრუნება' },
  ru: { title: 'Сервис не найден', back: 'Назад к сервисам' },
};

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { locale, slug } = await params;
  const meta = getLocalizedMeta(slug, locale);

  if (!meta) {
    const text = NOT_FOUND_TEXT[locale] ?? NOT_FOUND_TEXT['en']!;
    return (
      <section className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
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

  return (
    <ServicePageClient
      serviceId={slug}
      serviceName={meta.headline}
      serviceIcon={meta.icon}
      agentId={agentId}
      locale={locale}
      features={meta.features}
      description={meta.description}
    />
  );
}
