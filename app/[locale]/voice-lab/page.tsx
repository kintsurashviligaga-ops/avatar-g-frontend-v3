import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import VoiceLab from '@/components/voice/VoiceLab';
import { createServerClient } from '@/lib/supabase/server';

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
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  return <VoiceLab />;
}
