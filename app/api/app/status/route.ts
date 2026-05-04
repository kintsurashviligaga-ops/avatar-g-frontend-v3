import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { SERVICE_CONFIGS } from '@/lib/service-chat/service-configs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type KeyStatus = 'ready' | 'partial' | 'missing';

const APP_KEYS = [
  { id: 'openai', env: 'OPENAI_API_KEY' },
  { id: 'anthropic', env: 'ANTHROPIC_API_KEY' },
  { id: 'replicate', env: 'REPLICATE_API_TOKEN' },
  { id: 'nanobanana', env: 'NANOBANANA_API_KEY' },
  { id: 'udio', env: 'UDIO_API_KEY' },
  { id: 'ltx', env: 'LTX_VIDEO_API_KEY' },
  { id: 'heygen', env: 'HEYGEN_API_KEY' },
  { id: 'deepgram', env: 'DEEPGRAM_API_KEY' },
  { id: 'elevenlabs', env: 'ELEVENLABS_API_KEY' },
  { id: 'cartesia', env: 'CARTESIA_API_KEY' },
  { id: 'stripe', env: 'STRIPE_SECRET_KEY' },
  { id: 'supabase_service', env: 'SUPABASE_SERVICE_ROLE_KEY' },
] as const;

type ProviderId = typeof APP_KEYS[number]['id'];

type ServiceKeyStatus = {
  slug: string;
  name: string;
  status: KeyStatus;
  configured: number;
  total: number;
  providers: Array<{ id: ProviderId; configured: boolean }>;
};

const DEFAULT_SERVICE_PROVIDERS: readonly ProviderId[] = ['openai'];

const SERVICE_PROVIDER_REQUIREMENTS: Partial<Record<string, readonly ProviderId[]>> = {
  avatar: ['openai', 'heygen', 'nanobanana', 'replicate'],
  video: ['openai', 'ltx', 'heygen'],
  image: ['openai', 'nanobanana', 'replicate'],
  music: ['openai', 'udio'],
  text: ['openai', 'anthropic'],
  workflow: ['openai', 'replicate', 'nanobanana', 'ltx', 'heygen', 'elevenlabs', 'stripe'],
  shop: ['openai', 'stripe'],
  editing: ['openai', 'nanobanana', 'replicate', 'ltx'],
  'agent-g': ['openai', 'anthropic', 'deepgram', 'elevenlabs', 'cartesia'],
  photo: ['openai', 'nanobanana', 'replicate'],
  media: ['openai', 'nanobanana', 'replicate', 'ltx', 'heygen', 'elevenlabs'],
  prompt: ['openai', 'anthropic'],
  'visual-intel': ['openai', 'anthropic'],
  software: ['openai', 'anthropic'],
  business: ['openai', 'anthropic'],
  tourism: ['openai', 'anthropic'],
  game: ['openai', 'anthropic', 'nanobanana', 'replicate'],
  interior: ['openai', 'replicate', 'nanobanana'],
};

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

function buildServiceStatuses(
  providerStatusMap: Map<ProviderId, boolean>,
): ServiceKeyStatus[] {
  return Object.entries(SERVICE_CONFIGS)
    .map(([slug, serviceConfig]) => {
      const requiredProviders = SERVICE_PROVIDER_REQUIREMENTS[slug] || DEFAULT_SERVICE_PROVIDERS;
      const providers = requiredProviders.map((providerId) => ({
        id: providerId,
        configured: providerStatusMap.get(providerId) === true,
      }));

      const configured = providers.filter((provider) => provider.configured).length;
      const total = providers.length;

      return {
        slug,
        name: serviceConfig.name.en,
        status: resolveKeyStatus(configured, total),
        configured,
        total,
        providers,
      } satisfies ServiceKeyStatus;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(request: NextRequest) {
  const providers = APP_KEYS.map((item) => ({
    id: item.id,
    configured: hasValue(process.env[item.env]),
  }));

  const configured = providers.filter((provider) => provider.configured).length;
  const total = providers.length;
  const status = resolveKeyStatus(configured, total);
  const providerStatusMap = new Map<ProviderId, boolean>(
    providers.map((provider) => [provider.id, provider.configured]),
  );
  const services = buildServiceStatuses(providerStatusMap);

  const requestedService = request.nextUrl.searchParams.get('service');
  const currentService = requestedService
    ? services.find((service) => service.slug === requestedService) || null
    : null;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance: number | null = null;
  let plan: string | null = null;
  let resetAt: string | null = null;

  if (user) {
    const [{ data: creditsRow }, { data: userCreditsRow }, { data: subscriptionRow }] = await Promise.all([
      supabase.from('credits').select('balance, reset_at').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_credits').select('balance, plan_id, period_end').eq('user_id', user.id).maybeSingle(),
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

    plan = typeof subscriptionRow?.plan === 'string'
      ? subscriptionRow.plan
      : typeof userCreditsRow?.plan_id === 'string'
        ? userCreditsRow.plan_id
        : null;

    resetAt = typeof creditsRow?.reset_at === 'string'
      ? creditsRow.reset_at
      : typeof userCreditsRow?.period_end === 'string'
        ? userCreditsRow.period_end
        : null;
  }

  return NextResponse.json({
    keys: {
      status,
      configured,
      total,
      providers,
    },
    currentService,
    services,
    billing: {
      authenticated: Boolean(user),
      balance,
      plan,
      resetAt,
    },
  });
}
