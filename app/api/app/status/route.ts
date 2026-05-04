import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type KeyStatus = 'ready' | 'partial' | 'missing';

const APP_KEYS = [
  { id: 'openai', env: 'OPENAI_API_KEY' },
  { id: 'anthropic', env: 'ANTHROPIC_API_KEY' },
  { id: 'replicate', env: 'REPLICATE_API_TOKEN' },
  { id: 'deepgram', env: 'DEEPGRAM_API_KEY' },
  { id: 'elevenlabs', env: 'ELEVENLABS_API_KEY' },
  { id: 'cartesia', env: 'CARTESIA_API_KEY' },
  { id: 'stripe', env: 'STRIPE_SECRET_KEY' },
  { id: 'supabase_service', env: 'SUPABASE_SERVICE_ROLE_KEY' },
] as const;

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveKeyStatus(configured: number, total: number): KeyStatus {
  if (configured <= 0) {
    return 'missing';
  }

  if (configured >= total) {
    return 'ready';
  }

  return 'partial';
}

export async function GET() {
  const providers = APP_KEYS.map((item) => ({
    id: item.id,
    configured: hasValue(process.env[item.env]),
  }));

  const configured = providers.filter((provider) => provider.configured).length;
  const total = providers.length;
  const status = resolveKeyStatus(configured, total);

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance: number | null = null;
  let plan: string | null = null;

  if (user) {
    const [{ data: creditsRow }, { data: userCreditsRow }, { data: subscriptionRow }] = await Promise.all([
      supabase.from('credits').select('balance').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_credits').select('balance').eq('user_id', user.id).maybeSingle(),
      supabase.from('subscriptions').select('plan').eq('user_id', user.id).maybeSingle(),
    ]);

    const resolvedBalance = creditsRow?.balance ?? userCreditsRow?.balance;
    if (typeof resolvedBalance === 'number' && Number.isFinite(resolvedBalance)) {
      balance = resolvedBalance;
    } else if (resolvedBalance != null) {
      const parsed = Number(resolvedBalance);
      if (Number.isFinite(parsed)) {
        balance = parsed;
      }
    }

    plan = typeof subscriptionRow?.plan === 'string' ? subscriptionRow.plan : null;
  }

  return NextResponse.json({
    keys: {
      status,
      configured,
      total,
      providers,
    },
    billing: {
      authenticated: Boolean(user),
      balance,
      plan,
    },
  });
}
