import Link from 'next/link';
import { getLocalizedMeta, getAgentIdForService } from '@/lib/services/metadata';
import ServicePageClient from './ServicePageClient';

type ServiceDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

const SHORT_SLUGS = [
  'avatar', 'video', 'editing', 'music', 'photo', 'image',
  'media', 'text', 'prompt', 'visual-intel', 'workflow', 'shop', 'agent-g',
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
      <section className="min-h-screen bg-[#050510] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto bg-white/[0.03] border border-white/[0.08] rounded-2xl flex items-center justify-center mb-4">
            <span className="text-3xl opacity-30">?</span>
          </div>
          <h1 className="text-2xl font-semibold">{text.title}</h1>
          <Link href={`/${locale}/services`} className="text-sm text-cyan-300 hover:text-cyan-200 transition-colors">
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
