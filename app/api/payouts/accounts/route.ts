import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerEnv } from '@/lib/env/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

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
      .from('payout_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[GET /api/payouts/accounts]', error);
    return NextResponse.json({ error: 'Failed to fetch payout accounts' }, { status: 500 });
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
    const { type, details } = body as { type: 'stripe' | 'tbc' | 'bog' | 'payze'; details: Record<string, any> };

    if (!type || !details) {
      return NextResponse.json({ error: 'type and details are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('payout_accounts')
      .insert([
        {
          user_id: user.id,
          type,
          details_json: details,
          status: 'pending',
        },
      ])
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[POST /api/payouts/accounts]', error);
    return NextResponse.json({ error: 'Failed to create payout account' }, { status: 500 });
  }
}
