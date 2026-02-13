import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerEnv } from '@/lib/env/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

const MIN_PAYOUT_CENTS = 5000; // 50.00
const AML_REVIEW_THRESHOLD_CENTS = 500000; // 5,000.00

function getSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    getServerEnv().NEXT_PUBLIC_SUPABASE_URL || '',
    getServerEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('payout_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('requested_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[GET /api/payouts/requests]', error);
    return NextResponse.json({ error: 'Failed to fetch payout requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { amount_cents, currency } = body as { amount_cents: number; currency: 'GEL' | 'USD' };

    if (!amount_cents || amount_cents <= 0) {
      return NextResponse.json({ error: 'amount_cents must be > 0' }, { status: 400 });
    }

    if (!currency || !['GEL', 'USD'].includes(currency)) {
      return NextResponse.json({ error: 'currency must be GEL or USD' }, { status: 400 });
    }

    if (amount_cents < MIN_PAYOUT_CENTS) {
      return NextResponse.json({ error: `Minimum payout is ${MIN_PAYOUT_CENTS} cents` }, { status: 400 });
    }

    // Check subscription plan (FREE cannot withdraw)
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', user.id)
      .single();

    if (!subscription || subscription.plan === 'FREE') {
      return NextResponse.json({ error: 'Withdrawals are not available on the Free plan' }, { status: 403 });
    }

    const reviewRequired = amount_cents >= AML_REVIEW_THRESHOLD_CENTS;

    const { data, error } = await supabase
      .from('payout_requests')
      .insert([
        {
          user_id: user.id,
          amount_cents: Math.round(amount_cents),
          currency,
          status: 'requested',
          review_required: reviewRequired,
          notes: reviewRequired ? 'AML review required for large payout' : null,
        },
      ])
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[POST /api/payouts/requests]', error);
    return NextResponse.json({ error: 'Failed to create payout request' }, { status: 500 });
  }
}
