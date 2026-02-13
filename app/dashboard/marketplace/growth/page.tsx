import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import GrowthKPIsClient from './GrowthKPIsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Marketplace Growth KPIs - Avatar G',
  description: 'Real-time performance metrics and growth analytics',
};

export default async function GrowthPage() {
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Marketplace Growth KPIs</h1>
          <p className="text-gray-400">
            Real-time performance metrics, analytics, and growth trends
          </p>
        </div>

        <GrowthKPIsClient storeId={storeId} />
      </div>
    </div>
  );
}
