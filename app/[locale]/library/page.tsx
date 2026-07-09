import type { Metadata } from 'next';
import LibraryGallery from '@/components/library/LibraryGallery';
import { ChatChrome } from '@/components/studio/ChatChrome';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'en' ? 'Library — MyAvatar' : locale === 'ru' ? 'Библиотека — MyAvatar' : 'ბიბლიოთეკა — MyAvatar';
  return { title };
}

export default async function LibraryPage({ params }: Props) {
  const { locale } = await params;
  // Wrap the gallery in the SAME shell the dashboard uses (ChatChrome is fixed inset-0,
  // so it covers the global marketing header/nav and gives Library the dark studio
  // sidebar + header). scrollBody lets the gallery scroll inside the shell.
  return (
    <ChatChrome locale={locale} scrollBody>
      <LibraryGallery locale={locale} />
    </ChatChrome>
  );
}
