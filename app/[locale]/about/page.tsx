import Link from 'next/link';

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <section className="min-h-screen bg-[#050510] text-white flex items-center justify-center px-6">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-4xl font-bold">About MyAvatar.ge</h1>
        <p className="text-gray-400 leading-relaxed">
          MyAvatar.ge is Georgia&apos;s premier AI creative workspace — 16 modules for avatar creation, video production, music, design, business intelligence, tourism, and more.
        </p>
        <Link href={`/${locale}`} className="inline-block text-cyan-300 hover:text-cyan-200 text-sm">
          &larr; Back home
        </Link>
      </div>
    </section>
  );
}
