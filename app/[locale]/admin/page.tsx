import { redirect } from 'next/navigation';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { adminAllowlist } from '@/lib/auth/adminGuard';
import { gatherAdminStats, type AdminStats } from '@/lib/admin/stats';
import { listUsers, type AdminUserPage } from '@/lib/admin/users';
import { checkPipelineHealth, type PipelineHealth } from '@/lib/pipeline/statusAgent';
import AdminDashboard from '@/components/admin/AdminDashboard';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type Props = { params: Promise<{ locale: string }> };

const EMPTY_STATS: AdminStats = { totalUsers: 0, gensToday: 0, gensWeek: 0, gensAllTime: 0, failedGens: 0, revenueGel: 0, byService: [], recentSignups: [], recentGenerations: [], dau: 0, successRate: 0, recentFailures: [] };

export default async function AdminPage({ params }: Props) {
  const { locale } = await params;

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // SECURITY: authorize ONLY off the email allowlist (founder ∪ ADMIN_EMAILS) — the SAME gate the admin
  // APIs use. Never trust user_metadata for authz: it is client-writable via supabase.auth.updateUser,
  // so any signed-in user could forge is_admin/role and reach this page's service-role data + user PII.
  const email = user?.email?.trim().toLowerCase() ?? '';
  const isAdmin = email !== '' && adminAllowlist().includes(email);
  if (!isAdmin) {
    // eslint-disable-next-line no-console
    console.warn(`[admin] access denied → /dashboard | hasUser=${!!user} email=${user?.email ?? 'none'}`);
    redirect(`/${locale}/dashboard`);
  }

  // All admin data via the service-role client (above RLS). Fail-open so the panel always renders.
  let stats: AdminStats = EMPTY_STATS;
  let initialUsers: AdminUserPage = { users: [], total: 0 };
  try {
    const svc = createServiceRoleClient();
    if (svc) {
      [stats, initialUsers] = await Promise.all([
        gatherAdminStats(svc).catch(() => EMPTY_STATS),
        listUsers(svc, { page: 0 }).catch(() => ({ users: [], total: 0 })),
      ]);
    }
  } catch {
    /* keep empties */
  }

  const pipelineHealth: PipelineHealth | null = await checkPipelineHealth().catch(() => null);

  return <AdminDashboard locale={locale} stats={stats} initialUsers={initialUsers} pipelineHealth={pipelineHealth} />;
}
