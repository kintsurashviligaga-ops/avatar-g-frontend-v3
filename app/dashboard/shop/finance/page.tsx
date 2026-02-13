import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import SimulatorClient from './SimulatorClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Finance Simulator - Avatar G',
  description: 'Real-time financial simulation and profitability analysis',
};

export default async function FinanceDashboardPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Finance Simulator</h1>
          <p className="text-gray-400">
            Model scenarios, analyze margins, and find your break-even point
          </p>
        </div>

        <SimulatorClient />
      </div>
    </div>
  );
}
