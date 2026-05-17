import { redirect } from 'next/navigation';
import CommandCenter from '@/components/dashboard/command-center/CommandCenter';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;

  let userName = 'Guest Operator';
  let isAuthenticated = false;
  let shouldOnboard = false;

  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      isAuthenticated = true;
      userName = user.user_metadata?.full_name || user.email || 'Authenticated User';

      // First-login onboarding gate — only persona rows count (name IS NOT NULL)
      const { data: avatar } = await supabase
        .from('avatars')
        .select('id')
        .eq('user_id', user.id)
        .not('name', 'is', null)
        .limit(1)
        .maybeSingle();

      if (!avatar) {
        shouldOnboard = true;
      }
    }
  } catch {
    // Guest mode fallback
  }

  if (shouldOnboard) {
    redirect(`/${locale}/onboarding`);
  }

  return <CommandCenter locale={locale} userName={userName} isAuthenticated={isAuthenticated} />;
}
