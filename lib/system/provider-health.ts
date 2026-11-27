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
// gemini-embedding-001 and Agent G dictation on Chirp 3 (v5.1 M-14), so OpenAI is gone too: Google is the only AI provider.
type ProviderName = 'gemini';

export type ProviderAuditEntry = {
  provider: ProviderName;
  envKey: string;
  configured: boolean;
  status: 'missing_key' | 'configured' | 'healthy' | 'unhealthy';
  detail: string;
  creditsRemaining: number | null;
};

export type ServiceRoutingAudit = {
  category: 'text' | 'memory';
  provider: ProviderName;
  envKey: string;
  configured: boolean;
};

const PROVIDER_ENV: Record<ProviderName, string> = {
  // Not a key: Gemini runs on Vertex AI under Workload Identity (MASTER TASK v3.1), so the row names the project variable.
  gemini: 'GCP_PROJECT_ID',
};

const ROUTING_MATRIX: Array<{ category: ServiceRoutingAudit['category']; provider: ProviderName }> = [
  { category: 'text', provider: 'gemini' },
  { category: 'memory', provider: 'gemini' },
];

function hasKey(_provider: ProviderName): boolean {
  // An AI Studio key is not a Gemini credential under v3.1: Gemini is "configured" when Vertex AI can serve it.
  return googleAiConfigured();
}

async function probe(_provider: ProviderName): Promise<{ ok: boolean; detail: string; creditsRemaining: number | null }> {
  // Vertex AI readiness: the policy, the variable names and a minted Workload Identity token. No model is called and
  // nothing is billed. The Developer API probe this replaces spent one generated token on the AI Studio balance.
  try {
    const readiness = await checkGoogleAiReadiness({ live: true });
    return { ok: readiness.ok, detail: readiness.detail, creditsRemaining: null };
  } catch {
    return { ok: false, detail: 'Provider probe failed', creditsRemaining: null };
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
        const detail = (await checkGoogleAiReadiness()).detail;
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
