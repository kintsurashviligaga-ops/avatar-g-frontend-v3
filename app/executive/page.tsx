import { requireUser } from '@/lib/supabase/server';
import ExecutiveDashboard from '@/components/executive/ExecutiveDashboard';

export const dynamic = 'force-dynamic';

export default async function ExecutivePage() {
  const user = await requireUser();
  return <ExecutiveDashboard userId={user.id} />;
}
