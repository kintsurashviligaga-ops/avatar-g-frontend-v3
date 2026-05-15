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

  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      isAuthenticated = true;
      userName = user.user_metadata?.full_name || user.email || 'Authenticated User';
    }
  } catch {
    // Fall back to guest mode when auth infrastructure is unavailable.
  }

  return <CommandCenter locale={locale} userName={userName} isAuthenticated={isAuthenticated} />;
}
