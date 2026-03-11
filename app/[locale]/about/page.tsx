import Link from 'next/link';

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <section className="min-h-screen bg-transparent flex items-center justify-center px-6" style={{ color: 'var(--color-text)' }}>
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-4xl font-bold">About MyAvatar.ge</h1>
        <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          MyAvatar.ge is Georgia&apos;s premier AI creative workspace — 16 modules for avatar creation, video production, music, design, business intelligence, tourism, and more.
        </p>
        <Link href={`/${locale}`} className="inline-block text-sm transition-colors" style={{ color: 'var(--color-accent)' }}>
          &larr; Back home
        </Link>
      </div>
    </section>
  );
}
