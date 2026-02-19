import Link from 'next/link';
import { SERVICE_REGISTRY } from '@/lib/service-registry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function ServicesIndexPage() {
  const services = SERVICE_REGISTRY.filter((service) => service.enabled);

  console.log('SERVICE_REGISTRY.length', SERVICE_REGISTRY.length);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-app-text">AI Services</h1>
        <p className="text-sm text-app-muted">Choose one of {services.length} production-ready generators.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {services.map((service) => (
          <Card key={service.id} className="transition hover:border-app-neon/40">
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
                <Link href={service.route} className="text-sm text-cyan-300 hover:text-cyan-200">
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
