/**
 * /{locale}/admin/art-director — the Art Director image pipeline (Phase 8.4) for the first real test. Admin only, and only
 * when IMAGE_ART_DIRECTOR is 'admin' or 'everyone' (off by default: the page is a 404). Chat wiring comes in PR C.
 */
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { artDirectorAllowed } from '@/lib/image/artDirector/flag';
import { ArtDirectorClient } from '@/components/studio/artDirector/ArtDirectorClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export default async function ArtDirectorAdminPage({ params }: Props) {
  const { locale } = await params;
  const { data: { user } } = await createServerClient().auth.getUser();
  const admin = !!user && (await isAdminUserAsync(user));
  if (!admin || !artDirectorAllowed(admin)) notFound();
  const lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  return (
    <main className="min-h-screen bg-app-bg py-8">
      <ArtDirectorClient lang={lang} />
    </main>
  );
}
