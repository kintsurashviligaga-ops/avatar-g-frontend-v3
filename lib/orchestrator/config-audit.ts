/**
 * Config audit — production validation posture for every external integration.
 *
 * This is the "strict validation" layer: it does NOT change the runtime
 * fail-open safety net (Redis absent → in-memory, Claude absent → deterministic,
 * etc. — flipping those to fail-closed would take the live site down whenever an
 * optional integration is unconfigured). Instead it *reports*, per integration,
 * whether the required env is present (`live`), partially present (`degraded`),
 * or absent (`missing`), and whether its absence merely degrades (fail-open) or
 * hard-breaks a feature. Surfaced via /api/health/config + logged once on boot.
 *
 * Pure over process.env — no secret VALUES are ever returned, only presence.
 */

export type IntegrationStatus = 'live' | 'degraded' | 'missing';

export interface IntegrationAudit {
  id: string;
  label: string;
  status: IntegrationStatus;
  /** false → its absence hard-breaks a feature; true → graceful degradation. */
  failOpen: boolean;
  /** Operational meaning of this integration. */
  effect: string;
}

interface IntegrationSpec {
  id: string;
  label: string;
  /** AND across groups; OR within a group (any alias satisfies the group). */
  groups: string[][];
  failOpen: boolean;
  effect: string;
}

const SPECS: IntegrationSpec[] = [
  {
    id: 'supabase', label: 'Supabase', failOpen: true,
    effect: 'Auth, job persistence (reload-recovery) + credit ledger',
    groups: [['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'], ['SUPABASE_SERVICE_ROLE_KEY']],
  },
  {
    id: 'upstash', label: 'Upstash Redis', failOpen: true,
    effect: 'Durable cross-instance SSE + per-user rate-limit + global spend kill-switch',
    groups: [['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL'], ['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN']],
  },
  {
    id: 'anthropic', label: 'Anthropic (Claude)', failOpen: true,
    effect: 'Script/director agents → deterministic fallback when absent',
    groups: [['ANTHROPIC_API_KEY']],
  },
  {
    id: 'gemini', label: 'Google Gemini', failOpen: true,
    effect: 'Vision/geometry/intent → deterministic fallback when absent',
    groups: [['GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY']],
  },
  {
    id: 'elevenlabs', label: 'ElevenLabs', failOpen: true,
    effect: 'Premium voice → Google TTS fallback when absent',
    groups: [['ELEVENLABS_API_KEY']],
  },
  {
    id: 'openai', label: 'OpenAI', failOpen: true,
    effect: 'Whisper transcription / realtime fallback',
    groups: [['OPENAI_API_KEY']],
  },
  {
    id: 'runpod', label: 'RunPod GPU', failOpen: true,
    effect: 'GPU video assembly → CPU ffmpeg fallback when absent',
    groups: [['RUNPOD_API_TOKEN']],
  },
  {
    id: 'heygen', label: 'HeyGen', failOpen: false,
    effect: 'AI Avatar (talking-photo) produce pipeline',
    groups: [['HEYGEN_API_KEY']],
  },
  {
    id: 'replicate', label: 'Replicate', failOpen: false,
    effect: 'Image produce worker',
    groups: [['REPLICATE_API_TOKEN']],
  },
  {
    id: 'ltx', label: 'LTX Video', failOpen: false,
    effect: 'Cinematic video clip generation (Film pipeline)',
    groups: [['LTX_API_KEY', 'LTX2_API_KEY', 'LTX_VIDEO_API_KEY']],
  },
  {
    id: 'udio', label: 'Udio', failOpen: false,
    effect: 'Music produce worker',
    groups: [['UDIO_API_KEY']],
  },
  {
    id: 'stripe', label: 'Stripe', failOpen: false,
    effect: 'Subscriptions + customer billing portal',
    groups: [['STRIPE_SECRET_KEY']],
  },
];

function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

function statusOf(spec: IntegrationSpec): IntegrationStatus {
  const satisfied = spec.groups.filter((g) => g.some(present)).length;
  if (satisfied === spec.groups.length) return 'live';
  if (satisfied === 0) return 'missing';
  return 'degraded';
}

/** Per-integration presence audit (no secret values — presence only). */
export function auditConfig(): IntegrationAudit[] {
  return SPECS.map((s) => ({ id: s.id, label: s.label, status: statusOf(s), failOpen: s.failOpen, effect: s.effect }));
}

export interface ReadinessSummary {
  /** True when every hard-required (non-fail-open) integration is live. */
  ready: boolean;
  liveCount: number;
  total: number;
  /** Hard-required integrations that are not live (block features). */
  hardMissing: string[];
  /** Fail-open integrations running degraded (safe, but worth provisioning). */
  degraded: string[];
}

export function productionReadiness(audits: IntegrationAudit[] = auditConfig()): ReadinessSummary {
  const hardMissing = audits.filter((a) => !a.failOpen && a.status !== 'live').map((a) => a.id);
  const degraded = audits.filter((a) => a.failOpen && a.status !== 'live').map((a) => a.id);
  return {
    ready: hardMissing.length === 0,
    liveCount: audits.filter((a) => a.status === 'live').length,
    total: audits.length,
    hardMissing,
    degraded,
  };
}

let booted = false;
/**
 * Emit a one-time structured boot summary so the production posture is visible
 * in logs — without ever failing closed. Safe to call repeatedly (no-op after
 * first invocation per process).
 */
export function logConfigPostureOnce(): void {
  if (booted) return;
  booted = true;
  try {
    const summary = productionReadiness();
    const tag = summary.ready ? '[CONFIG:READY]' : '[CONFIG:DEGRADED]';
    // eslint-disable-next-line no-console
    console.info(`${tag} live=${summary.liveCount}/${summary.total}` +
      (summary.hardMissing.length ? ` hard-missing=${summary.hardMissing.join(',')}` : '') +
      (summary.degraded.length ? ` fail-open-degraded=${summary.degraded.join(',')}` : ''));
  } catch {
    /* never let diagnostics break a request */
  }
}
