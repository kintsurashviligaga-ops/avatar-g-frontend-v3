import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

/** Server-truth admin gate (email allowlist ∪ app_metadata role) — never client-writable metadata. */
async function requireAdmin() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user, ok: isAdminUser(user) };
}

export async function GET() {
  try {
    const { supabase, user, ok } = await requireAdmin();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
    const { supabase, user, ok } = await requireAdmin();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ok) {
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
