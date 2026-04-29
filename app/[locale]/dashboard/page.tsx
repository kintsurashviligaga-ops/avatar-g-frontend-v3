import MainDashboard from '@/components/dashboard/omni/MainDashboard';
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

  return <MainDashboard locale={locale} userName={userName} isAuthenticated={isAuthenticated} />;
}
