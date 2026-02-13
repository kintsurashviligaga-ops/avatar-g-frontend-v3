import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all stores for this user
    const { data: stores } = await supabase
      .from('stores')
      .select('id')
      .eq('user_id', user.id);

    if (!stores || stores.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const storeIds = stores.map((s) => s.id);

    // Get all payout requests for these stores
    const { data: payoutRequests } = await supabase
      .from('payout_requests')
      .select('*')
      .in('store_id', storeIds)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      data: payoutRequests || [],
    });
  } catch (error) {
    console.error('[GET /api/payouts/history]', error);
    return NextResponse.json({ error: 'Failed to fetch payout history' }, { status: 500 });
  }
}
