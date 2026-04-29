import { createServerClient } from '@/lib/supabase/server';
import { BusinessHub } from '@/components/business/BusinessHub';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DashboardBusinessAgentPage({ params }: Props) {
  await params;
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <BusinessHub userId={user?.id ?? 'anonymous'} />;
}
