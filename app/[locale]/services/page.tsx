import Link from 'next/link';
import { getLocalizedMeta } from '@/lib/services/metadata';

type ServicesPageProps = {
  params: Promise<{ locale: string }>;
};

const SERVICE_ORDER = [
  'avatar', 'video', 'editing', 'music', 'photo', 'image',
  'media', 'text', 'prompt', 'visual-intel', 'workflow', 'shop', 'agent-g',
] as const;

const PAGE_TEXT: Record<string, { title: string; subtitle: string }> = {
  en: { title: 'All Services', subtitle: '13 AI-powered modules.' },
  ka: { title: 'ყველა სერვისი', subtitle: '13 AI მოდული.' },
  ru: { title: 'Все сервисы', subtitle: '13 AI-модулей.' },
};

export default async function LocalizedServicesPage({ params }: ServicesPageProps) {
  const { locale } = await params;
  const text = PAGE_TEXT[locale] ?? PAGE_TEXT['ka']!;
  return (
    <section className="min-h-screen bg-[#050510] text-white py-24 px-4 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-4">{text.title}</h1>
        <p className="text-center text-gray-400 max-w-2xl mx-auto mb-16">{text.subtitle}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICE_ORDER.map((id) => {
            const meta = getLocalizedMeta(id, locale);
            if (!meta) return null;
            return (
              <Link key={id} href={`/${locale}/services/${id}`}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 transition-all duration-300 hover:border-cyan-400/30 hover:bg-white/[0.06]">
                <div className="text-3xl mb-4">{meta.icon}</div>
                <h2 className="text-lg font-semibold text-white mb-2 group-hover:text-cyan-300 transition-colors">{meta.headline}</h2>
                <p className="text-sm text-gray-400 leading-relaxed mb-4">{meta.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
