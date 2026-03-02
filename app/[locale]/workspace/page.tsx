import Link from 'next/link';

export default async function WorkspacePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <section className="min-h-screen bg-[#050510] text-white flex items-center justify-center px-6">
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-3xl font-bold">Workspace</h1>
        <p className="text-gray-400">Your AI workspace dashboard is loading&hellip;</p>
        <Link href={`/${locale}/services`} className="inline-block text-cyan-300 hover:text-cyan-200 text-sm">
          &larr; Browse Services
        </Link>
      </div>
    </section>
  );
}
