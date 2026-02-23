import { NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function randomCode(seed: string): string {
  return `AG${seed.slice(0, 4).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function POST() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSupabase = createServiceRoleClient();
  const { data: existing } = await adminSupabase
    .from('referral_codes')
    .select('code')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing?.code) {
    return NextResponse.json({ code: existing.code, existing: true });
  }

  const code = randomCode(user.id.replaceAll('-', ''));
  await adminSupabase.from('referral_codes').insert({ user_id: user.id, code });

  return NextResponse.json({ code, existing: false });
}
