import Link from 'next/link';
import ServiceLanding from '@/components/services/ServiceLanding';
import { SERVICE_META } from '@/lib/services/metadata';

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

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { locale, slug } = await params;
  const meta = SERVICE_META[slug];

  if (!meta) {
    return (
      <section className="min-h-screen bg-[#050510] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">Service not found</h1>
          <Link href={`/${locale}/services`} className="text-sm text-cyan-300 hover:text-cyan-200">Back to Services</Link>
        </div>
      </section>
    );
  }

  return <ServiceLanding icon={meta.icon} headline={meta.headline} description={meta.description} features={meta.features} serviceName={slug} />;
}
