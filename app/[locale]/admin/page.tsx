import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin/guard';
import { gatherAdminStats, type AdminStats } from '@/lib/admin/stats';
import { listUsers, type AdminUserPage } from '@/lib/admin/users';
import { checkPipelineHealth, type PipelineHealth } from '@/lib/pipeline/statusAgent';
import AdminDashboard from '@/components/admin/AdminDashboard';
import AdminLogin from '@/components/admin/AdminLogin';
import AdminAccessDenied from '@/components/admin/AdminAccessDenied';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type Props = { params: Promise<{ locale: string }> };

const EMPTY_STATS: AdminStats = { totalUsers: 0, gensToday: 0, gensWeek: 0, gensAllTime: 0, failedGens: 0, revenueGel: 0, byService: [], recentSignups: [], recentGenerations: [], dau: 0, successRate: 0, recentFailures: [] };

export default async function AdminPage({ params }: Props) {
  const { locale } = await params;

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // SECURITY (v358): authorize with isAdminUser — the SAME allowlist ∪ app_metadata gate the admin APIs
  // use. NEVER user_metadata: it is client-writable via supabase.auth.updateUser, so any signed-in user
  // could forge is_admin/role and reach this page's service-role data + user PII.
  //
  // v358 replaces the old "bounce non-admins to /dashboard" behaviour with a STRICT sign-in gate:
  //   • no session      → render the admin login screen (credentials + Google OAuth) in place;
  //   • session, no auth → render access-denied WITH a Log out action (switch to an authorized account);
  //   • session + admin  → render the panel. No redirect, so there is no bounce/loop and the operator can
  //     always see what to do next.
  if (!user) {
    return <AdminLogin locale={locale} redirectTo={`/${locale}/admin`} />;
  }
  if (!isAdminUser(user)) {
    // eslint-disable-next-line no-console
    console.warn(`[admin] access denied | email=${user.email ?? 'none'}`);
    return <AdminAccessDenied locale={locale} email={user.email ?? null} />;
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
