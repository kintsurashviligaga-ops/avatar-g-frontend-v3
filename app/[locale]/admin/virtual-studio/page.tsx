/**
 * /{locale}/admin/virtual-studio — the Virtual Studio (Phase 8.6) while AVATAR_STUDIO_V2 is off for the public.
 * 404 unless the flag allows this user (admin while 'admin', everyone while 'everyone'); the routes check the same.
 */
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { studioAllowed } from '@/lib/avatar/studio/flag';
import { studioBook } from '@/lib/avatar/studio/book';
import { VirtualStudio } from '@/components/studio/virtualStudio/VirtualStudio';
import type { StudioLang } from '@/components/studio/virtualStudio/labels';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export default async function VirtualStudioPage({ params }: Props) {
  const { locale } = await params;
  const { data: { user } } = await createServerClient().auth.getUser();
  if (!user || !studioAllowed(await isAdminUserAsync(user))) notFound();
  const lang: StudioLang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  return <VirtualStudio lang={lang} book={studioBook()} />;
}
