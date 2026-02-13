import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import LaunchPlanClient from './LaunchPlanClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Launch Plan - Avatar G',
  description: '90-day Georgia go-to-market strategies and growth tactics',
};

export default async function LaunchPage() {
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
          <h1 className="text-4xl font-bold mb-2">90-Day Launch Plan</h1>
          <p className="text-gray-400">
            Georgia-specific go-to-market strategies and growth tactics
          </p>
        </div>

        <LaunchPlanClient storeId={storeId} />
      </div>
    </div>
  );
}
