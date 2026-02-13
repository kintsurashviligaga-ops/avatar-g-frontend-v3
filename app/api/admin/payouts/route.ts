import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAccessToken } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (token.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('payout_requests')
      .select('*')
      .order('requested_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[GET /api/admin/payouts]', error);
    return NextResponse.json({ error: 'Failed to fetch payouts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (token.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { payout_request_id, status, notes } = body as {
      payout_request_id: string;
      status: 'approved' | 'rejected' | 'paid';
      notes?: string;
    };

    if (!payout_request_id || !status) {
      return NextResponse.json({ error: 'payout_request_id and status are required' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('payout_requests')
      .update({
        status,
        decided_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq('id', payout_request_id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[POST /api/admin/payouts]', error);
    return NextResponse.json({ error: 'Failed to update payout' }, { status: 500 });
  }
}
