/**
 * Gemini guard — defensive pre-fetch checks + structured billing/quota feedback
 * for every handler that talks to Google AI.
 *
 * Two classifiers (HTTP status for raw-fetch handlers, error-message for AI-SDK
 * handlers that throw) collapse onto one taxonomy, and `logGeminiState` emits a
 * single clean, greppable terminal line — so a billing/quota wall is instantly
 * distinguishable from an invalid key or a transient blip in production logs.
 */

export type GeminiState = 'ok' | 'billing_quota' | 'invalid_key' | 'bad_request' | 'transient' | 'error';

const KEY_VARS = ['GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GOOGLE_GENERATIVE_AI_API_KEY'] as const;

/** Pre-fetch check — is any Gemini credential configured? */
export function geminiKeyPresent(): boolean {
  return KEY_VARS.some((n) => {
    const v = process.env[n];
    return typeof v === 'string' && v.trim().length > 0;
  });
}

/** Classify a Gemini HTTP response status (+ optional body) into a state. */
export function classifyGeminiStatus(status: number, body = ''): GeminiState {
  if (status >= 200 && status < 300) return 'ok';
  const b = body.toLowerCase();
  if (status === 429) return 'billing_quota';
  if (status === 403) return 'invalid_key';
  if (status === 400) return /api[_ ]?key|api_key_invalid|invalid.*key/.test(b) ? 'invalid_key' : 'bad_request';
  if (status >= 500) return 'transient';
  return 'error';
}

/** Classify a thrown AI-SDK error message into the same taxonomy. */
export function classifyGeminiMessage(message: string): GeminiState {
  const m = (message || '').toLowerCase();
  if (m.includes('429') || m.includes('quota') || m.includes('resource_exhausted') || m.includes('rate limit') || m.includes('maxretriesexceeded') || m.includes('billing')) {
    return 'billing_quota';
  }
  if (m.includes('api key not valid') || m.includes('api_key_invalid') || m.includes('permission_denied') || m.includes('403')) {
    return 'invalid_key';
  }
  if (m.includes('400') || m.includes('invalid argument')) return 'bad_request';
  if (m.includes('500') || m.includes('503') || m.includes('unavailable') || m.includes('overloaded')) return 'transient';
  if (!m) return 'ok';
  return 'error';
}

const TAG: Record<GeminiState, string> = {
  ok: '[GEMINI:OK]',
  billing_quota: '[GEMINI:BILLING]',
  invalid_key: '[GEMINI:AUTH]',
  bad_request: '[GEMINI:BADREQ]',
  transient: '[GEMINI:TRANSIENT]',
  error: '[GEMINI:ERROR]',
};

/** One-line human hint per state — surfaced in logs for fast triage. */
export function geminiStateHint(state: GeminiState): string {
  switch (state) {
    case 'billing_quota': return 'quota/billing wall — key is valid; enable billing or raise the tier limit';
    case 'invalid_key':   return 'API key invalid or lacks permission — rotate/repair the key';
    case 'bad_request':   return 'malformed request payload';
    case 'transient':     return 'transient upstream blip — safe to retry';
    case 'error':         return 'unclassified error';
    case 'ok':            return 'healthy';
  }
}

/**
 * Emit a clean structured terminal line for a non-OK Gemini state.
 * Returns the classified state so callers can branch on it.
 */
export function logGeminiState(ctx: string, state: GeminiState, detail = ''): GeminiState {
  if (state === 'ok') return state;
  // eslint-disable-next-line no-console
  console.warn(`${TAG[state]} ctx=${ctx} — ${geminiStateHint(state)}${detail ? ` :: ${detail.slice(0, 160)}` : ''}`);
  return state;
}
