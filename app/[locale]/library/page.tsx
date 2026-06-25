import type { Metadata } from 'next';
import LibraryGallery from '@/components/library/LibraryGallery';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'en' ? 'Library — MyAvatar.ge' : locale === 'ru' ? 'Библиотека — MyAvatar.ge' : 'ბიბლიოთეკა — MyAvatar.ge';
  return { title };
}

export default async function LibraryPage({ params }: Props) {
  const { locale } = await params;
  return (
    <main className="min-h-dvh bg-app-bg text-app-text">
      <LibraryGallery locale={locale} />
    </main>
  );
}
