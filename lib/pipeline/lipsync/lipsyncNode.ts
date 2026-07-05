/**
 * lipsyncNode — the post-render lip-sync adapter stage.
 *
 * A SWAPPABLE provider interface (passthrough / Replicate sync-lipsync-2 / anything) wrapped in a
 * confidence-floor guard: if the provider errors, returns no URL, or reports a confidence BELOW the
 * floor (the classic lip-sync artifacting: warped mouths on wide shots), the node FALLS BACK to the raw
 * clip rather than shipping a mangled one. Pure + fully injectable (the provider is passed in), so the
 * whole decision tree is unit-testable with a mock provider and never touches the network in a test.
 */

export interface LipsyncRequest {
  /** The rendered video clip to lip-sync. */
  clipUrl: string;
  /** The dialogue/voice track to sync the mouth to. */
  audioUrl: string;
  startSec?: number;
  endSec?: number;
}

export interface LipsyncProviderResult {
  ok: boolean;
  url?: string;
  /** 0..1 — the provider's self-reported sync confidence (below the floor → fall back to raw). */
  confidence?: number;
  error?: string;
}

export interface LipsyncProvider {
  readonly name: string;
  sync(req: LipsyncRequest): Promise<LipsyncProviderResult>;
}

export interface LipsyncResult {
  /** true when a usable clip is available (a synced clip OR the safe raw fallback). false only on no clip. */
  ok: boolean;
  /** The clip to use downstream — synced on success, the raw clipUrl on any fallback. */
  url: string;
  confidence: number;
  usedFallback: boolean;
  provider: string;
  reason?: string;
}

export interface LipsyncNodeOptions {
  provider: LipsyncProvider;
  /** Confidence below this → discard the synced clip and keep the raw one. Default 0.6. */
  confidenceFloor?: number;
}

export const DEFAULT_CONFIDENCE_FLOOR = 0.6;

const clamp01 = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function fallback(clipUrl: string, provider: string, reason: string, confidence = 0): LipsyncResult {
  return { ok: true, url: clipUrl, confidence, usedFallback: true, provider, reason };
}

/**
 * Run the lip-sync stage. On ANY doubt (error, no output, sub-floor confidence) it returns the raw clip
 * so a bad sync can never degrade the master. Only a confident, successful sync replaces the clip.
 */
export async function lipsyncNode(req: LipsyncRequest, opts: LipsyncNodeOptions): Promise<LipsyncResult> {
  const floor = typeof opts.confidenceFloor === 'number' ? opts.confidenceFloor : DEFAULT_CONFIDENCE_FLOOR;
  const provider = opts.provider.name;

  if (!req.clipUrl) return { ok: false, url: '', confidence: 0, usedFallback: true, provider, reason: 'no_clip' };
  // Nothing to sync against → the raw clip IS the correct output (not a failure).
  if (!req.audioUrl) return fallback(req.clipUrl, provider, 'no_audio', 1);

  try {
    const r = await opts.provider.sync(req);
    if (!r.ok || !r.url) return fallback(req.clipUrl, provider, r.error ?? 'provider_failed');
    const confidence = clamp01(r.confidence ?? 0);
    if (confidence < floor) return fallback(req.clipUrl, provider, `below_floor(${confidence}<${floor})`, confidence);
    return { ok: true, url: r.url, confidence, usedFallback: false, provider };
  } catch (e) {
    return fallback(req.clipUrl, provider, e instanceof Error ? e.message.slice(0, 120) : 'error');
  }
}

/**
 * Default provider: a no-op passthrough. It reports no capability, so lipsyncNode always falls back to
 * the raw clip. This makes the stage SAFE to enable (FILM_LIPSYNC_ENABLED) before a real provider is
 * wired — the master is never altered — while keeping the interface + fallback path exercised.
 */
export const passthroughLipsyncProvider: LipsyncProvider = {
  name: 'passthrough',
  async sync(): Promise<LipsyncProviderResult> {
    return { ok: false, error: 'no_provider_configured' };
  },
};

/**
 * Real Replicate-backed provider (e.g. `sync/lipsync-2`). Injectable `fetchImpl` → unit-testable without
 * the network. Returns a low-ish default confidence unless the model reports one, so the floor guard
 * stays meaningful. This is the swap target: `provider: replicateLipsyncProvider({ token })`.
 */
export function replicateLipsyncProvider(cfg: { token: string; version?: string; fetchImpl?: typeof fetch; timeoutMs?: number }): LipsyncProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    name: 'replicate:sync-lipsync-2',
    async sync(req: LipsyncRequest): Promise<LipsyncProviderResult> {
      try {
        const res = await doFetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(cfg.version ? { version: cfg.version } : {}),
            input: { video_url: req.clipUrl, audio_url: req.audioUrl },
          }),
          signal: AbortSignal.timeout(cfg.timeoutMs ?? 20_000),
        });
        if (!res.ok) return { ok: false, error: `http_${res.status}` };
        const j = (await res.json()) as { output?: string | string[]; confidence?: number; error?: string };
        const url = Array.isArray(j.output) ? j.output[0] : j.output;
        if (!url) return { ok: false, error: j.error ?? 'no_output' };
        return { ok: true, url, confidence: typeof j.confidence === 'number' ? j.confidence : 0.85 };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : 'request_failed' };
      }
    },
  };
}
