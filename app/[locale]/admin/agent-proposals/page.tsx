import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin/guard';
import AgentProposalsReview from '@/components/admin/AgentProposalsReview';

// STEP 5 admin gate: the human review surface for optimizer proposals. Approving here is the ONLY
// path that promotes a live agent_configs version. Same admin gate as the main admin dashboard.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Agent proposals · Admin' };

const ADMIN_EMAIL = 'kintsurashviligaga@gmail.com';

type Props = { params: Promise<{ locale: string }> };

export default async function AgentProposalsPage({ params }: Props) {
  const { locale } = await params;
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = isAdminUser(user) || (user?.email?.toLowerCase() === ADMIN_EMAIL);
  if (!admin) redirect(`/${locale}/dashboard`);

  return <AgentProposalsReview />;
}
