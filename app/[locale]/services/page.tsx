import Link from 'next/link';
import { getLocalizedMeta } from '@/lib/services/metadata';

type ServicesPageProps = {
  params: Promise<{ locale: string }>;
};

const SERVICE_ORDER = [
  'avatar', 'video', 'editing', 'music', 'photo', 'image',
  'media', 'text', 'prompt', 'visual-intel', 'workflow', 'shop', 'agent-g',
  'software', 'business', 'tourism', 'next',
] as const;

const PAGE_TEXT: Record<string, { title: string; subtitle: string }> = {
  en: { title: 'All Services', subtitle: '17 AI-powered modules.' },
  ka: { title: 'ყველა სერვისი', subtitle: '17 AI მოდული.' },
  ru: { title: 'Все сервисы', subtitle: '17 AI-модулей.' },
};

export default async function LocalizedServicesPage({ params }: ServicesPageProps) {
  const { locale } = await params;
  const text = PAGE_TEXT[locale] ?? PAGE_TEXT['ka']!;
  return (
    <section className="relative min-h-screen bg-transparent text-white py-20 md:py-24 px-4 sm:px-6 lg:px-10 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-45"
        style={{ backgroundImage: "url('/backgrounds/services/agent-g.svg')" }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(34,211,238,0.18),transparent_50%),radial-gradient(circle_at_80%_82%,rgba(139,92,246,0.18),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.58),rgba(2,6,23,0.4)_30%,rgba(2,6,23,0.62)_100%)]" />
      <div className="relative mx-auto max-w-6xl">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-4 tracking-tight">{text.title}</h1>
        <p className="text-center text-gray-300/85 max-w-2xl mx-auto mb-12 md:mb-14">{text.subtitle}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {SERVICE_ORDER.map((id) => {
            const meta = getLocalizedMeta(id, locale);
            if (!meta) return null;
            return (
              <Link key={id} href={`/${locale}/services/${id}`}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.12] bg-white/[0.05] p-5 md:p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-white/[0.09] hover:shadow-[0_12px_40px_rgba(6,182,212,0.18)]">
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.18),transparent_50%)]" />
                <div className="relative text-3xl mb-3">{meta.icon}</div>
                <h2 className="relative text-lg font-semibold text-white mb-2 group-hover:text-cyan-200 transition-colors">{meta.headline}</h2>
                <p className="relative text-sm text-gray-300/85 leading-relaxed">{meta.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
