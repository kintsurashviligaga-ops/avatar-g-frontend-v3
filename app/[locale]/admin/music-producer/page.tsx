/**
 * /{locale}/admin/music-producer — the Music Producer pipeline (Phase 8.5) for the first real test. Admin only, and only
 * when MUSIC_PRODUCER_V2 is 'admin' or 'everyone' (off by default: the page is a 404). Chat + video wiring comes in PR C.
 */
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { producerAllowed } from '@/lib/music/producer/flag';
import { producerBook } from '@/lib/music/producer/book';
import { MusicProducerClient } from '@/components/studio/musicProducer/MusicProducerClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export default async function MusicProducerAdminPage({ params }: Props) {
  const { locale } = await params;
  const { data: { user } } = await createServerClient().auth.getUser();
  const admin = !!user && (await isAdminUserAsync(user));
  if (!admin || !producerAllowed(admin)) notFound();
  const lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  return (
    <main className="min-h-screen bg-app-bg py-8">
      <MusicProducerClient lang={lang} book={producerBook()} />
    </main>
  );
}
