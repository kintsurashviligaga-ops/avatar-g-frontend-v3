import 'server-only';

import { checkGoogleAiReadiness } from '@/lib/ai/google/readiness';
import { googleAiConfigured } from '@/lib/ai/google/transport';

/**
 * One slow vendor must not stall the audit: every live probe gets this long, and they run side by side. Before, the
 * probes ran one after another with no limit at all, so seven providers (one vendor's avatar list alone could take seconds)
 * overran the route's 15 s and /api/app/health answered a runtime timeout — monitoring went blind exactly when needed.
 */
export const PROBE_DEADLINE_MS = 8_000;

// HeyGen, World Labs and LTX were removed (v5.1 M-14, GG 2026-11-12), and Udio and Anthropic are refused in production
// (Google only, MASTER TASK v3.1): no route reaches them, so they are not probed. Chat-memory embeddings run on
// gemini-embedding-001 (v5.1 M-14); OpenAI stays only for Agent G dictation (lib/agent-g/voice/stt) until it moves to Google.
type ProviderName = 'openai' | 'gemini';

export type ProviderAuditEntry = {
  provider: ProviderName;
  envKey: string;
  configured: boolean;
  status: 'missing_key' | 'configured' | 'healthy' | 'unhealthy';
  detail: string;
  creditsRemaining: number | null;
};

export type ServiceRoutingAudit = {
  category: 'text' | 'memory' | 'dictation';
  provider: ProviderName;
  envKey: string;
  configured: boolean;
};

const PROVIDER_ENV: Record<ProviderName, string> = {
  openai: 'OPENAI_API_KEY',
  // Not a key: Gemini runs on Vertex AI under Workload Identity (MASTER TASK v3.1), so the row names the project variable.
  gemini: 'GCP_PROJECT_ID',
};

const ROUTING_MATRIX: Array<{ category: ServiceRoutingAudit['category']; provider: ProviderName }> = [
  { category: 'text', provider: 'gemini' },
  { category: 'memory', provider: 'gemini' },
  { category: 'dictation', provider: 'openai' },
];

function hasKey(provider: ProviderName): boolean {
  // An AI Studio key is not a Gemini credential under v3.1: Gemini is "configured" when Vertex AI can serve it.
  if (provider === 'gemini') return googleAiConfigured();
  const env = PROVIDER_ENV[provider];
  return typeof process.env[env] === 'string' && String(process.env[env]).trim().length > 0;
}

function getKey(provider: ProviderName): string {
  return String(process.env[PROVIDER_ENV[provider]] || '').trim();
}

async function probe(provider: ProviderName): Promise<{ ok: boolean; detail: string; creditsRemaining: number | null }> {
  if (provider === 'gemini') {
    // Vertex AI readiness: the policy, the variable names and a minted Workload Identity token. No model is called and
    // nothing is billed. The Developer API probe this replaces spent one generated token on the AI Studio balance.
    const readiness = await checkGoogleAiReadiness({ live: true });
    return { ok: readiness.ok, detail: readiness.detail, creditsRemaining: null };
  }
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

    return { ok: false, detail: 'No probe for this provider', creditsRemaining: null };
  } catch (error) {
    return {
      ok: false,
      // `detail` is served by /api/app/health (operators only now, but still) — a thrown message must never carry the key back.
      detail: error instanceof Error ? error.message.split(key).join('[redacted]') : 'Provider probe failed',
      creditsRemaining: null,
    };
  }
}

/** The probe's answer, or a "no answer" verdict once `ms` has passed — never hangs, never throws. */
function withDeadline<T>(work: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout), ms);
  });
  return Promise.race([work, late]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function runProviderHealthAudit(options: { live?: boolean; deadlineMs?: number } = {}): Promise<{
  routing: ServiceRoutingAudit[];
  providers: ProviderAuditEntry[];
}> {
  const live = options.live === true;
  const deadlineMs = options.deadlineMs ?? PROBE_DEADLINE_MS;
  const providers = Object.keys(PROVIDER_ENV) as ProviderName[];

  // Side by side, in the declared order: the slowest vendor — not the sum of them — sets how long the audit takes.
  const results: ProviderAuditEntry[] = await Promise.all(
    providers.map(async (provider): Promise<ProviderAuditEntry> => {
      const envKey = PROVIDER_ENV[provider];
      const configured = hasKey(provider);
      if (!configured) {
        // Gemini names what Vertex AI lacks (variable names only) instead of a key it no longer reads.
        const detail = provider === 'gemini' ? (await checkGoogleAiReadiness()).detail : 'API key is not configured';
        return { provider, envKey, configured: false, status: 'missing_key', detail, creditsRemaining: null };
      }
      if (!live) {
        return { provider, envKey, configured: true, status: 'configured', detail: 'Configured (live probe skipped)', creditsRemaining: null };
      }
      const probeResult = await withDeadline(probe(provider), deadlineMs, {
        ok: false,
        detail: `No answer within ${deadlineMs < 1000 ? `${deadlineMs} ms` : `${Math.round(deadlineMs / 1000)} s`}`,
        creditsRemaining: null,
      });
      return {
        provider,
        envKey,
        configured: true,
        status: probeResult.ok ? 'healthy' : 'unhealthy',
        detail: probeResult.detail,
        creditsRemaining: probeResult.creditsRemaining,
      };
    }),
  );

  const routing: ServiceRoutingAudit[] = ROUTING_MATRIX.map((item) => ({
    category: item.category,
    provider: item.provider,
    envKey: PROVIDER_ENV[item.provider],
    configured: hasKey(item.provider),
  }));

  return { routing, providers: results };
}
