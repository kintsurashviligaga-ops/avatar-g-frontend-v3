import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-internal-worker-token');
  if (!process.env.WORKER_INTERNAL_TOKEN || token !== process.env.WORKER_INTERNAL_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const { data: events } = await supabase
    .from('events')
    .select('id,type,user_id,metadata,processed')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(100);

  let processed = 0;

  for (const event of events ?? []) {
    if (event.type === 'referral_reward_pending' && event.user_id) {
      const rewardType = String((event.metadata as Record<string, unknown>)?.reward_type ?? 'bonus_credits');
      const rewardUnits = Number((event.metadata as Record<string, unknown>)?.reward_units ?? 0);

      if (rewardType === 'bonus_credits' && rewardUnits > 0) {
        const { data: credits } = await supabase
          .from('credits')
          .select('balance')
          .eq('user_id', event.user_id)
          .maybeSingle();

        await supabase
          .from('credits')
          .upsert({
            user_id: event.user_id,
            balance: Number(credits?.balance ?? 0) + rewardUnits,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
      }
    }

    await supabase
      .from('events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', event.id);

    processed += 1;
  }

  return NextResponse.json({ ok: true, processed });
}
