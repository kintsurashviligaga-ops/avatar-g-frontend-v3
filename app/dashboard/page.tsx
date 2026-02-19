import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getMonthlyUsageSummary, getRecentJobs } from '@/lib/jobs/jobs';
import { AGENT_REGISTRY } from '@/lib/agents/registry';
import { getPlanSummary } from '@/lib/billing/enforce';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString();
}

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/login');
  }

  const supabase = createRouteHandlerClient();
  await supabase.rpc('reset_user_credits_if_due', { p_user_id: user.id });

  const [{ data: subscription }, { data: credits }, recentJobs, monthlySummary] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('plan, status, current_period_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('credits')
      .select('balance, monthly_allowance, reset_at')
      .eq('user_id', user.id)
      .single(),
    getRecentJobs({ userId: user.id, limit: 12 }),
    getMonthlyUsageSummary(user.id),
  ]);

  const plan = getPlanSummary(subscription?.plan || 'FREE');

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] px-4 py-10 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-cyan-500/20 bg-white/5 p-6 backdrop-blur-sm">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-300">Plan status, credits, jobs, and monthly usage.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-cyan-500/20 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-wider text-cyan-300">Plan</p>
            <h2 className="mt-2 text-xl font-semibold">{plan.label}</h2>
            <p className="mt-1 text-sm text-gray-300">Status: {subscription?.status || 'active'}</p>
            <p className="text-sm text-gray-300">Current period end: {formatDate(subscription?.current_period_end || null)}</p>
          </article>

          <article className="rounded-2xl border border-cyan-500/20 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-wider text-cyan-300">Credits</p>
            <h2 className="mt-2 text-xl font-semibold">{credits?.balance ?? 0}</h2>
            <p className="mt-1 text-sm text-gray-300">Monthly allowance: {credits?.monthly_allowance ?? plan.monthlyCredits}</p>
            <p className="text-sm text-gray-300">Next reset: {formatDate(credits?.reset_at || null)}</p>
          </article>

          <article className="rounded-2xl border border-cyan-500/20 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-wider text-cyan-300">This month</p>
            <h2 className="mt-2 text-xl font-semibold">{monthlySummary.jobsCount} jobs</h2>
            <p className="mt-1 text-sm text-gray-300">Credits spent: {monthlySummary.creditsSpent}</p>
            <p className="text-sm text-gray-300">Auto reset policy: monthly</p>
          </article>
        </section>

        <section className="rounded-2xl border border-cyan-500/20 bg-white/5 p-5">
          <h3 className="text-lg font-semibold">Usage by Service</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {monthlySummary.byService.map((service) => (
              <div key={service.agentId} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-sm font-medium text-cyan-200">{AGENT_REGISTRY[service.agentId]?.name || service.agentId}</p>
                <p className="text-xs text-gray-300">Jobs: {service.jobs}</p>
                <p className="text-xs text-gray-300">Credits: {service.credits}</p>
              </div>
            ))}
            {monthlySummary.byService.length === 0 && (
              <p className="text-sm text-gray-300">No usage recorded this month yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-cyan-500/20 bg-white/5 p-5">
          <h3 className="text-lg font-semibold">Recent Jobs</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-cyan-200">
                <tr>
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Cost</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => (
                  <tr key={job.id} className="border-t border-white/10 text-gray-200">
                    <td className="px-3 py-2">{AGENT_REGISTRY[job.agent_id]?.name || job.agent_id}</td>
                    <td className="px-3 py-2">{job.cost}</td>
                    <td className="px-3 py-2">{job.status}</td>
                    <td className="px-3 py-2">{formatDate(job.created_at)}</td>
                  </tr>
                ))}
                {recentJobs.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-gray-400" colSpan={4}>No jobs yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
