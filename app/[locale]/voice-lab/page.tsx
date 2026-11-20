import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import VoiceLab from '@/components/voice/VoiceLab';
import { createServerClient, getSessionUser } from '@/lib/supabase/server';
import { signInPath } from '@/lib/routing/signIn';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Voice Lab',
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function VoiceLabPage({ params }: Props) {
  const { locale } = await params;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await getSessionUser(supabase);

  if (!user) {
    redirect(signInPath(locale, { redirect: `/${locale}/voice-lab` }));
  }

  return <VoiceLab />;
}
