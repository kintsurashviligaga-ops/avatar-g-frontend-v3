import Link from 'next/link';
import { getLocalizedServices } from '@/lib/service-registry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type ServicesPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocalizedServicesPage({ params }: ServicesPageProps) {
  const { locale } = await params;
  const services = getLocalizedServices(locale).filter((service) => service.enabled);

  const content = {
    en: {
      title: '13 Services',
      subtitle: 'Browse 13 active services.',
      active: 'Active',
      open: 'Open',
      ariaOpenPrefix: 'Open',
    },
    ka: {
      title: '13 სერვისი',
      subtitle: 'დაათვალიერე 13 აქტიური სერვისი.',
      active: 'აქტიური',
      open: 'გახსნა',
      ariaOpenPrefix: 'გახსენი',
    },
    ru: {
      title: '13 сервисов',
      subtitle: 'Просмотрите 13 активных сервисов.',
      active: 'Активно',
      open: 'Открыть',
      ariaOpenPrefix: 'Открыть',
    },
  };

  const pageText = content[locale as 'en' | 'ka' | 'ru'] ?? content.ka;

  const getServiceHref = (slug: string) => `/${locale}/services/${slug}`;

  return (
    <section className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-app-text">{pageText.title}</h1>
        <p className="text-sm text-app-muted">{pageText.subtitle}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {services.map((service) => (
          <Card key={service.id} className="relative transition hover:border-app-neon/40">
            <Link
              href={getServiceHref(service.slug)}
              aria-label={`${pageText.ariaOpenPrefix} ${service.name}`}
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
                <Badge variant="success">{pageText.active}</Badge>
                <Link
                  href={getServiceHref(service.slug)}
                  className="relative z-20 pointer-events-auto text-sm text-cyan-300 hover:text-cyan-200"
                >
                  {pageText.open}
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
