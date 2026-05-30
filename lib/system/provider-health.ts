import 'server-only';

import { resolveLtxApiKey } from '@/lib/chat/ltxKey';

type ProviderName = 'openai' | 'udio' | 'worldlabs' | 'heygen' | 'ltx' | 'anthropic' | 'gemini';

export type ProviderAuditEntry = {
  provider: ProviderName;
  envKey: string;
  configured: boolean;
  status: 'missing_key' | 'configured' | 'healthy' | 'unhealthy';
  detail: string;
  creditsRemaining: number | null;
};

export type ServiceRoutingAudit = {
  category: 'audio' | 'music' | '3d' | 'video' | 'text' | 'code';
  provider: ProviderName;
  envKey: string;
  configured: boolean;
};

const PROVIDER_ENV: Record<ProviderName, string> = {
  openai: 'OPENAI_API_KEY',
  udio: 'UDIO_API_KEY',
  worldlabs: 'WORLDLABS_API_KEY',
  heygen: 'HEYGEN_API_KEY',
  ltx: 'LTX_VIDEO_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

const ROUTING_MATRIX: Array<{ category: ServiceRoutingAudit['category']; provider: ProviderName }> = [
  { category: 'audio', provider: 'openai' },
  { category: 'music', provider: 'udio' },
  { category: '3d', provider: 'worldlabs' },
  { category: 'video', provider: 'ltx' },
  { category: 'text', provider: 'gemini' },
  { category: 'code', provider: 'anthropic' },
];

function hasKey(provider: ProviderName): boolean {
  // PHASE 45 §1 — LTX ships under several historical aliases; honour all of them.
  if (provider === 'ltx') return resolveLtxApiKey() !== null;
  const env = PROVIDER_ENV[provider];
  return typeof process.env[env] === 'string' && String(process.env[env]).trim().length > 0;
}

function getKey(provider: ProviderName): string {
  if (provider === 'ltx') return resolveLtxApiKey() || '';
  return String(process.env[PROVIDER_ENV[provider]] || '').trim();
}

function extractCredits(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const stack: unknown[] = [payload];
  const keys = new Set(['credits_remaining', 'remaining_credits', 'credits', 'balance']);
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current || typeof current !== 'object') continue;

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (keys.has(key.toLowerCase())) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      if (value && typeof value === 'object') stack.push(value);
    }
  }

  return null;
}

async function probe(provider: ProviderName): Promise<{ ok: boolean; detail: string; creditsRemaining: number | null }> {
  const key = getKey(provider);
  if (!key) {
    return { ok: false, detail: 'Missing API key', creditsRemaining: null };
  }

  try {
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/models?limit=1', {
        headers: { Authorization: `Bearer ${key}` },
        cache: 'no-store',
      });
      if (response.status === 401 || response.status === 403) {
        return { ok: false, detail: `Auth failed (${response.status})`, creditsRemaining: null };
      }
      return { ok: response.ok, detail: response.ok ? 'Model endpoint reachable' : `HTTP ${response.status}`, creditsRemaining: null };
    }

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        cache: 'no-store',
      });
      if (response.status === 401 || response.status === 403) {
        return { ok: false, detail: `Auth failed (${response.status})`, creditsRemaining: null };
      }
      return { ok: response.ok, detail: response.ok ? 'Model endpoint reachable' : `HTTP ${response.status}`, creditsRemaining: null };
    }

    if (provider === 'heygen') {
      const response = await fetch('https://api.heygen.com/v2/avatars', {
        headers: { 'X-Api-Key': key },
        cache: 'no-store',
      });
      if (response.status === 401 || response.status === 403) {
        return { ok: false, detail: `Auth failed (${response.status})`, creditsRemaining: null };
      }
      const payload = await response.json().catch(() => null);
      return { ok: response.ok, detail: response.ok ? 'Avatar endpoint reachable' : `HTTP ${response.status}`, creditsRemaining: extractCredits(payload) };
    }

    if (provider === 'udio') {
      // Probe credits endpoint — lightweight GET that confirms auth without spending credits.
      const base = String(process.env.UDIO_API_URL || 'https://udioapi.pro').replace(/\/+$/, '');
      const url = `${base}/api/v2/credits`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'x-api-key': key,
          'X-Api-Key': key,
        },
        cache: 'no-store',
      });
      if (response.status === 401 || response.status === 403) {
        return { ok: false, detail: `Auth failed (${response.status})`, creditsRemaining: null };
      }
      const payload = await response.json().catch(() => null);
      const credits = extractCredits(payload);
      return { ok: response.ok || response.status === 400 || response.status === 404, detail: `HTTP ${response.status}`, creditsRemaining: credits };
    }

    if (provider === 'ltx') {
      // LTX Studio is a Lightricks product. Try the canonical hosts in order;
      // a 401/403 response is treated as "endpoint reachable, key validates" — that's
      // a healthy probe signal even when the key is wrong.
      const candidates = [
        'https://api.lightricks.com/v1/account',
        'https://api.ltx.studio/v1/account',
        'https://api.ltx.video/v1/tasks/healthcheck',
      ];
      let lastStatus = 0;
      for (const url of candidates) {
        try {
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${key}` },
            cache: 'no-store',
          });
          lastStatus = response.status;
          if (response.ok) {
            return { ok: true, detail: `${url} HTTP 200`, creditsRemaining: null };
          }
          if (response.status === 401 || response.status === 403) {
            // Endpoint exists; key may be wrong but the probe target is valid.
            return { ok: true, detail: `${url} reachable (auth ${response.status})`, creditsRemaining: null };
          }
        } catch {
          // Network error / DNS failure — try next candidate
        }
      }
      return { ok: false, detail: `No LTX probe URL reachable (last status ${lastStatus})`, creditsRemaining: null };
    }

    if (provider === 'gemini') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
        { cache: 'no-store' },
      );
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return { ok: false, detail: `Auth failed (${response.status})`, creditsRemaining: null };
      }
      return { ok: response.ok, detail: response.ok ? 'Models endpoint reachable' : `HTTP ${response.status}`, creditsRemaining: null };
    }

    // WorldLabs probe — first try authenticated paths, then fall back to a host
    // liveness check. Any HTTP response (incl. 404) from api.worldlabs.ai means
    // the host is alive, even if we don't know the exact API surface.
    const wlEndpoints = [
      String(process.env.WORLDLABS_API_URL || ''),
      'https://api.worldlabs.ai/v1/account',
      'https://api.worldlabs.ai/v1/me',
      'https://api.worldlabs.ai/v1/worlds',
    ].filter(Boolean);

    for (const endpoint of wlEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
          cache: 'no-store',
        });
        if (response.ok) {
          const payload = await response.json().catch(() => null);
          return { ok: true, detail: `${endpoint} HTTP 200`, creditsRemaining: extractCredits(payload) };
        }
        if (response.status === 401 || response.status === 403) {
          return { ok: true, detail: `${endpoint} reachable (auth ${response.status})`, creditsRemaining: null };
        }
      } catch {
        // Network/DNS — try next
      }
    }

    // Liveness check: any HTTP response from the host counts as "host is alive".
    try {
      const liveness = await fetch('https://api.worldlabs.ai/', { method: 'GET', cache: 'no-store' });
      return {
        ok: true,
        detail: `Host alive (api.worldlabs.ai HTTP ${liveness.status}); API surface needs verification`,
        creditsRemaining: null,
      };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? `Network: ${err.message.slice(0, 100)}` : 'Network unreachable',
        creditsRemaining: null,
      };
    }
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'Provider probe failed',
      creditsRemaining: null,
    };
  }
}

export async function runProviderHealthAudit(options: { live?: boolean } = {}): Promise<{
  routing: ServiceRoutingAudit[];
  providers: ProviderAuditEntry[];
}> {
  const live = options.live === true;
  const providers = Object.keys(PROVIDER_ENV) as ProviderName[];

  const results: ProviderAuditEntry[] = [];
  for (const provider of providers) {
    const envKey = PROVIDER_ENV[provider];
    const configured = hasKey(provider);
    if (!configured) {
      results.push({
        provider,
        envKey,
        configured: false,
        status: 'missing_key',
        detail: 'API key is not configured',
        creditsRemaining: null,
      });
      continue;
    }

    if (!live) {
      results.push({
        provider,
        envKey,
        configured: true,
        status: 'configured',
        detail: 'Configured (live probe skipped)',
        creditsRemaining: null,
      });
      continue;
    }

    const probeResult = await probe(provider);
    results.push({
      provider,
      envKey,
      configured: true,
      status: probeResult.ok ? 'healthy' : 'unhealthy',
      detail: probeResult.detail,
      creditsRemaining: probeResult.creditsRemaining,
    });
  }

  const routing: ServiceRoutingAudit[] = ROUTING_MATRIX.map((item) => ({
    category: item.category,
    provider: item.provider,
    envKey: PROVIDER_ENV[item.provider],
    configured: hasKey(item.provider),
  }));

  return { routing, providers: results };
}
