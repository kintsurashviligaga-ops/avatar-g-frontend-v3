import Link from 'next/link';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SERVICE_REGISTRY } from '@/lib/service-registry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type ServicesPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocalizedServicesPage({ params }: ServicesPageProps) {
  const { locale } = await params;
  const services = SERVICE_REGISTRY.filter((service) => service.enabled);

  const getServiceHref = (slug: string) => `/${locale}/services/${slug}`;

  console.log('SERVICE_REGISTRY.length', SERVICE_REGISTRY.length);

  if (process.env.NODE_ENV !== 'production') {
    const slugs = services.map((service) => service.slug);
    const unresolved = services.filter((service) => {
      const baseRoutePage = join(process.cwd(), 'app', 'services', service.slug, 'page.tsx');
      const localeRoutePage = join(process.cwd(), 'app', '[locale]', 'services', service.slug, 'page.tsx');
      return !existsSync(baseRoutePage) && !existsSync(localeRoutePage);
    });

    console.log('SERVICE_REGISTRY.slugs', slugs);
    if (unresolved.length > 0) {
      console.warn('SERVICE_REGISTRY.unresolved', unresolved.map((service) => service.slug));
    }
  }

  return (
    <section className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-app-text">All Services</h1>
        <p className="text-sm text-app-muted">Browse {services.length} active services.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {services.map((service) => (
          <Card key={service.id} className="relative transition hover:border-app-neon/40">
            <Link
              href={getServiceHref(service.slug)}
              aria-label={`Open ${service.name}`}
              className="absolute inset-0 z-10 rounded-2xl pointer-events-auto"
            />
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="text-base">{service.icon}</span>
                {service.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-app-muted">{service.description}</p>
              <div className="flex items-center justify-between">
                <Badge variant="success">Active</Badge>
                <Link
                  href={getServiceHref(service.slug)}
                  className="relative z-20 pointer-events-auto text-sm text-cyan-300 hover:text-cyan-200"
                >
                  Open
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
