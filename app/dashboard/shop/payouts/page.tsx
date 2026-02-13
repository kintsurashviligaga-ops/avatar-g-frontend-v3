import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import PayoutsClient from './PayoutsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Payouts - Avatar G',
  description: 'Request payouts and manage payout accounts',
};

export default async function PayoutsPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get first store for demo
  const { data: stores } = await supabase
    .from('stores')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);

  const storeId = stores?.[0]?.id;

  if (!storeId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black text-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <p className="text-gray-400">No store found. Create a store first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Payouts</h1>
          <p className="text-gray-400">
            Request payouts and track your payment account status
          </p>
        </div>

        <PayoutsClient storeId={storeId} />
      </div>
    </div>
  );
}
