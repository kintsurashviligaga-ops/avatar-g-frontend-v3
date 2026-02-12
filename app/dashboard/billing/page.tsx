/**
 * Billing Dashboard Page - Comprehensive billing, credits, and usage view
 * Server component with data fetching
 */

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPlan, daysUntilReset } from '@/lib/billing/plans';
import { getRecentJobs, getJobStats } from '@/lib/jobs/jobs';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { CreditsSummary } from '@/components/dashboard/CreditsSummary';
import { PlanCard } from '@/components/dashboard/PlanCard';
import { RecentJobs } from '@/components/dashboard/RecentJobs';
import { UsageStats } from '@/components/dashboard/UsageStats';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Billing & Usage - Avatar G',
  description: 'Manage your subscription and track usage',
};

export default async function BillingDashboardPage() {
  const supabase = createSupabaseServerClient();
  
   // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    redirect('/login');
  }
  
  // Fetch subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single();
  
  if (!subscription) {
    // Initialize subscription for new users
    await supabase.from('subscriptions').insert({
      user_id: user.id,
      stripe_customer_id: `temp_${user.id}`,
      plan: 'FREE',
      status: 'active',
    });
    
    await supabase.from('credits').insert({
      user_id: user.id,
      balance: 100,
      monthly_allowance: 100,
    });
    
    redirect('/dashboard/billing'); // Reload
  }
  
  // Fetch credits
  const { data: credits } = await supabase
    .from('credits')
    .select('*')
    .eq('user_id', user.id)
    .single();
  
  if (!credits) {
    return <div className="p-8 text-white">Initializing credits...</div>;
  }
  
  // Fetch recent jobs
  const jobs = await getRecentJobs(user.id, 10);
  
  // Fetch job stats
  const stats = await getJobStats(user.id);
  
  // Calculate derived values
  const nextReset = new Date(credits.next_reset_at);
  const daysLeft = daysUntilReset(nextReset);
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black text-white">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        
        {/* Header */}
        <DashboardHeader 
          userName={user.user_metadata?.full_name || user.email || 'User'}
          plan={subscription.plan}
        />
        
        {/* Top Row: Plan + Credits */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PlanCard
            plan={subscription.plan}
            status={subscription.status}
            currentPeriodEnd={subscription.current_period_end}
            cancelAtPeriodEnd={subscription.cancel_at_period_end}
          />
          
          <CreditsSummary
            balance={credits.balance}
            monthlyAllowance={credits.monthly_allowance}
            nextResetAt={nextReset}
            daysLeft={daysLeft}
            totalSpent={credits.total_spent}
          />
        </div>
        
        {/* Usage Stats */}
        <UsageStats stats={stats} />
        
        {/* Recent Jobs */}
        <RecentJobs jobs={jobs} />
        
        {/* Back Link */}
        <div className="text-center pt-4">
          <a
            href="/dashboard"
            className="text-sm text-cyan-400 hover:text-cyan-300 transition"
          >
            ← Back to Dashboard
          </a>
        </div>
        
      </div>
    </div>
  );
}
