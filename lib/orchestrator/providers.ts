/**
 * Provider env-map registry — the "degraded → operational" gate.
 *
 * Each third-party vendor declares the env key(s) that activate it. A
 * runner asks `isProviderActive(provider, env)` before dispatching: when
 * the key is present the request flows to the live SDK; when absent the
 * runner returns its localized fallback error — no interface rewrite, no
 * mock loop. As soon as an operator pastes a key into Vercel and redeploys,
 * the provider wakes up automatically.
 *
 * Pure + injectable: pass an explicit `env` for tests; defaults to
 * process.env at the call site.
 */

export type ProviderId =
  | 'gemini' | 'anthropic' | 'openai'
  | 'elevenlabs' | 'udio'
  | 'replicate' | 'heygen'
  | 'luma' | 'runway' | 'pika' | 'nanobanana'
  | 'azure_speech' | 'figma'
  | 'runpod';

/** Env keys that activate each provider (ANY present = active). */
export const PROVIDER_ENV: Record<ProviderId, string[]> = {
  gemini:      ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  anthropic:   ['ANTHROPIC_API_KEY'],
  openai:      ['OPENAI_API_KEY'],
  elevenlabs:  ['ELEVENLABS_API_KEY'],
  udio:        ['UDIO_API_KEY'],
  replicate:   ['REPLICATE_API_TOKEN'],
  heygen:      ['HEYGEN_API_KEY'],
  luma:        ['LUMA_API_KEY'],
  runway:      ['RUNWAY_API_KEY'],
  pika:        ['PIKA_API_KEY'],
  nanobanana:  ['NANOBANANA_API_KEY'],
  azure_speech:['AZURE_COGNITIVE_SECRET', 'AZURE_SPEECH_REGION'],
  figma:       ['FIGMA_ACCESS_TOKEN'],
  runpod:      ['RUNPOD_RENDER_WEBHOOK_URL', 'RUNPOD_RENDER_WEBHOOK_TOKEN', 'RUNPOD_API_TOKEN'],
};

type Env = Record<string, string | undefined>;

function present(key: string, env: Env): boolean {
  return Boolean(String(env[key] ?? '').trim());
}

/** True when at least one activating key for the provider is set. */
export function isProviderActive(provider: ProviderId, env: Env = process.env): boolean {
  const keys = PROVIDER_ENV[provider];
  if (!keys) return false;
  // azure_speech + runpod need BOTH halves; everything else needs ANY one.
  if (provider === 'azure_speech') {
    return present('AZURE_COGNITIVE_SECRET', env) && present('AZURE_SPEECH_REGION', env);
  }
  if (provider === 'runpod') {
    return present('RUNPOD_RENDER_WEBHOOK_URL', env) &&
      (present('RUNPOD_RENDER_WEBHOOK_TOKEN', env) || present('RUNPOD_API_TOKEN', env));
  }
  return keys.some(k => present(k, env));
}

/** Snapshot of every provider's active state — for the status panel / report. */
export function providerSnapshot(env: Env = process.env): Record<ProviderId, boolean> {
  const out = {} as Record<ProviderId, boolean>;
  (Object.keys(PROVIDER_ENV) as ProviderId[]).forEach(p => { out[p] = isProviderActive(p, env); });
  return out;
}

/** First activating value for a provider (the token a runner should use). */
export function providerKey(provider: ProviderId, env: Env = process.env): string | null {
  for (const k of PROVIDER_ENV[provider] ?? []) {
    const v = String(env[k] ?? '').trim();
    if (v) return v;
  }
  return null;
}
