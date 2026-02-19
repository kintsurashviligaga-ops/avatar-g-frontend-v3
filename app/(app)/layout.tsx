import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { AppShellClient } from '@/components/layout/AppShellClient';

export const dynamic = 'force-dynamic';

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth');
  }

  return <AppShellClient userEmail={user.email ?? 'user@myavatar.ge'}>{children}</AppShellClient>;
}