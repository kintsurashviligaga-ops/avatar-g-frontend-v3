import Link from 'next/link';

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <section className="min-h-screen bg-transparent flex items-center justify-center px-6" style={{ color: 'var(--color-text)' }}>
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-3xl font-bold">Contact Us</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>Email: support@myavatar.ge</p>
        <Link href={`/${locale}`} className="inline-block text-sm transition-colors" style={{ color: 'var(--color-accent)' }}>
          &larr; Back home
        </Link>
      </div>
    </section>
  );
}
