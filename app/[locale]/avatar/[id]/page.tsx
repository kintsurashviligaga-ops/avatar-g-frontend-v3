import Link from 'next/link';

export default async function AvatarDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return (
    <section className="min-h-screen bg-[#050510] text-white flex items-center justify-center px-6">
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-3xl font-bold">Avatar #{id}</h1>
        <p className="text-gray-400">Avatar detail view is coming soon.</p>
        <Link href={`/${locale}/services/avatar`} className="inline-block text-cyan-300 hover:text-cyan-200 text-sm">
          &larr; Back to Avatar Builder
        </Link>
      </div>
    </section>
  );
}
