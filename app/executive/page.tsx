import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import ExecutiveDashboard from '@/components/executive/ExecutiveDashboard';

export const dynamic = 'force-dynamic';

export default async function ExecutivePage() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/executive');
  return <ExecutiveDashboard userId={user.id} />;
}
