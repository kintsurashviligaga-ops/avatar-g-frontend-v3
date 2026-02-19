import Link from 'next/link';

type ConfigFallbackPageProps = {
  params: Promise<{ locale: string; path?: string[] }>;
};

export default async function ConfigFallbackPage({ params }: ConfigFallbackPageProps) {
  const { locale, path } = await params;

  return (
    <section className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-app-text">Configuration</h1>
      <p className="text-sm text-app-muted">
        The requested config path{path?.length ? ` /${path.join('/')}` : ''} is not required for service browsing.
      </p>
      <div className="flex gap-3">
        <Link href={`/${locale}/services`} className="text-sm text-cyan-300 hover:text-cyan-200">
          Open services
        </Link>
        <Link href={`/${locale}`} className="text-sm text-cyan-300 hover:text-cyan-200">
          Back home
        </Link>
      </div>
    </section>
  );
}
