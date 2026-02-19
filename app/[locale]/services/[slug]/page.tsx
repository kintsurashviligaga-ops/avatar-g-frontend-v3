import Link from 'next/link';
import type { ComponentType } from 'react';
import { SERVICE_REGISTRY } from '@/lib/service-registry';

type ServiceDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

const SERVICE_PAGE_LOADERS: Record<string, () => Promise<{ default: ComponentType }>> = {
  'online-shop': () => import('@/app/services/online-shop/page'),
  'avatar-builder': () => import('@/app/services/avatar-builder/page'),
  'music-studio': () => import('@/app/services/music-studio/page'),
  'video-studio': () => import('@/app/services/video-studio/page'),
  'media-production': () => import('@/app/services/media-production/page'),
  'visual-intelligence': () => import('@/app/services/visual-intelligence/page'),
  'image-creator': () => import('@/app/services/image-creator/page'),
  'agent-g': () => import('@/app/services/agent-g/page'),
  'social-media': () => import('@/app/services/social-media/page'),
  'social-media-manager': () => import('@/app/services/social-media-manager/page'),
  'prompt-builder': () => import('@/app/services/prompt-builder/page'),
  'text-intelligence': () => import('@/app/services/text-intelligence/page'),
  'photo-studio': () => import('@/app/services/photo-studio/page'),
  marketplace: () => import('@/app/services/marketplace/page'),
  'business-agent': () => import('@/app/services/business-agent/page'),
  'game-creator': () => import('@/app/services/game-creator/page'),
  'voice-lab': () => import('@/app/services/voice-lab/page'),
};

export async function generateStaticParams() {
  return SERVICE_REGISTRY.filter((service) => service.enabled).map((service) => ({
    slug: service.slug,
  }));
}

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { locale, slug } = await params;
  const service = SERVICE_REGISTRY.find((entry) => entry.slug === slug && entry.enabled);
  const servicePageLoader = SERVICE_PAGE_LOADERS[slug];

  if (!service || !servicePageLoader) {
    return (
      <section className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-app-text">Service not found</h1>
        <p className="text-sm text-app-muted">No service is registered for this route.</p>
        <Link
          href={`/${locale}/services`}
          className="inline-flex relative z-20 pointer-events-auto text-sm text-cyan-300 hover:text-cyan-200"
        >
          Back to Services
        </Link>
      </section>
    );
  }

  const ServiceComponent = (await servicePageLoader()).default;

  return (
    <>
      <div className="px-4 pt-4 sm:px-6 lg:px-8">
        <Link
          href={`/${locale}/services`}
          className="inline-flex relative z-20 pointer-events-auto text-sm text-cyan-300 hover:text-cyan-200"
        >
          Back to Services
        </Link>
      </div>
      <ServiceComponent />
    </>
  );
}
