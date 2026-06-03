import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import MemoryPanel from '@/components/memory/MemoryPanel';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Memory',
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function MemoryPage({ params }: Props) {
  const { locale } = await params;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  return <MemoryPanel />;
}
