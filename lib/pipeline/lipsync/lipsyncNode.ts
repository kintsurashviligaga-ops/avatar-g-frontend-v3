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

interface ReplicatePred {
  id?: string;
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string | null;
  urls?: { get?: string };
}

/**
 * Real Replicate video→lip-synced-video provider. Default model `sync/lipsync-2` (video-NATIVE — it
 * lip-syncs an existing multi-shot clip, identity/texture preserving for VECTOR 3), env-overridable via
 * FILM_LIPSYNC_REPLICATE_MODEL (e.g. `sync/lipsync-2-pro` on a Scale plan). Injectable `fetchImpl`.
 *
 * CORRECTNESS (fixes the prior latent no-op): the official-model endpoint is
 * `/v1/models/<slug>/predictions` (NO version hash), the sync/lipsync-2 input fields are `video` +
 * `audio` (NOT video_url/audio_url), and predictions are ASYNC — we CREATE then POLL to a terminal
 * state (the old code read `output` straight off CREATE, which is always null → guaranteed fail-open).
 */
export function replicateLipsyncProvider(cfg: { token: string; model?: string; fetchImpl?: typeof fetch; timeoutMs?: number; pollMs?: number }): LipsyncProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  const model = (cfg.model || 'sync/lipsync-2').trim();
  const budgetMs = cfg.timeoutMs ?? 180_000; // create + poll budget (a ~30s master syncs in ~1–2 min)
  return {
    name: `replicate:${model}`,
    async sync(req: LipsyncRequest): Promise<LipsyncProviderResult> {
      const deadline = Date.now() + budgetMs;
      try {
        const createRes = await doFetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', Prefer: 'wait' },
          // Official-model endpoint takes { input } only (no version hash). `Prefer: wait` holds ~60s;
          // give the abort 75s of headroom so a held response is never killed at the 60s boundary.
          body: JSON.stringify({ input: { video: req.clipUrl, audio: req.audioUrl } }),
          signal: AbortSignal.timeout(Math.min(75_000, budgetMs)),
        });
        if (!createRes.ok) return { ok: false, error: `http_${createRes.status}` };
        let pred = (await createRes.json().catch(() => ({}))) as ReplicatePred;
        const pollUrl = pred.urls?.get || (pred.id ? `https://api.replicate.com/v1/predictions/${pred.id}` : '');
        // Prefer: wait may already return terminal; otherwise poll until succeeded/failed or the budget runs out.
        while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled' && pollUrl && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, cfg.pollMs ?? 3_000));
          const pollRes = await doFetch(pollUrl, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
          if (!pollRes || !pollRes.ok) continue; // transient — keep polling until the deadline
          pred = (await pollRes.json().catch(() => pred)) as ReplicatePred;
        }
        if (pred.status !== 'succeeded') return { ok: false, error: pred.error ?? `status_${pred.status ?? 'timeout'}` };
        const raw = Array.isArray(pred.output) ? pred.output[0] : pred.output;
        if (typeof raw !== 'string' || !raw) return { ok: false, error: 'no_output' }; // only a real URL string escapes
        return { ok: true, url: raw, confidence: 0.85 };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : 'request_failed' };
      }
    },
  };
}

/**
 * HeyGen provider — PRIMARY in the cascade per the directive, but HONEST about its input type:
 * HeyGen's lip-sync engine is `talking_photo` (a face PHOTO + audio → a freshly-synthesized talking
 * head). It CANNOT lip-sync an existing multi-shot VIDEO — it would discard the film and emit a
 * single-face clip, silently overwriting the master. So a VIDEO clipUrl is DECLINED here (→ the
 * cascade falls through to the video-native Replicate leg). The image/avatar path attempts a real
 * create+poll and keys 401/402/403 as an explicit credit/subscription block. Injectable `fetchImpl`.
 */
export function heygenLipsyncProvider(cfg: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number; pollMs?: number }): LipsyncProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    name: 'heygen:talking-photo',
    async sync(req: LipsyncRequest): Promise<LipsyncProviderResult> {
      // A rendered film master is a VIDEO → HeyGen is the wrong tool → decline so Replicate handles it.
      if (/\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i.test(req.clipUrl)) {
        return { ok: false, error: 'heygen_requires_image_not_video' };
      }
      const budgetMs = cfg.timeoutMs ?? 180_000;
      const deadline = Date.now() + budgetMs;
      try {
        const createRes = await doFetch('https://api.heygen.com/v2/video/generate', {
          method: 'POST',
          headers: { 'X-Api-Key': cfg.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_inputs: [{
              character: { type: 'talking_photo', talking_photo_url: req.clipUrl },
              voice: { type: 'audio', audio_url: req.audioUrl },
            }],
          }),
          signal: AbortSignal.timeout(Math.min(60_000, budgetMs)),
        });
        if (createRes.status === 401 || createRes.status === 402 || createRes.status === 403) {
          return { ok: false, error: `heygen_credit_block_${createRes.status}` }; // subscription/credit → fall back
        }
        if (!createRes.ok) return { ok: false, error: `http_${createRes.status}` };
        const cj = (await createRes.json().catch(() => ({}))) as { data?: { video_id?: string } };
        const videoId = cj.data?.video_id;
        if (!videoId) return { ok: false, error: 'heygen_no_video_id' };
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, cfg.pollMs ?? 4_000));
          const st = await doFetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, { headers: { 'X-Api-Key': cfg.apiKey }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
          if (!st || !st.ok) continue;
          const sj = (await st.json().catch(() => ({}))) as { data?: { status?: string; video_url?: string } };
          if (sj.data?.status === 'completed' && sj.data.video_url) return { ok: true, url: sj.data.video_url, confidence: 0.9 };
          if (sj.data?.status === 'failed') return { ok: false, error: 'heygen_failed' };
        }
        return { ok: false, error: 'heygen_timeout' };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : 'request_failed' };
      }
    },
  };
}

/**
 * PRIORITY CASCADE — try each provider in order; the FIRST genuine success (ok + url) wins; a provider
 * that errors, declines (e.g. HeyGen on a video), or hits a credit block just advances to the next. If
 * every leg fails, it returns an aggregated error and lipsyncNode fail-opens to the raw clip. Pure +
 * provider-agnostic → the whole fallback tree is unit-testable with mock providers (no network).
 */
export function cascadeLipsyncProvider(providers: Array<LipsyncProvider | null | undefined>): LipsyncProvider {
  const usable = providers.filter((p): p is LipsyncProvider => !!p);
  return {
    name: usable.length ? `cascade:${usable.map((p) => p.name).join('>')}` : 'cascade:empty',
    async sync(req: LipsyncRequest): Promise<LipsyncProviderResult> {
      const errors: string[] = [];
      for (const p of usable) {
        try {
          const r = await p.sync(req);
          if (r.ok && r.url) return r; // first genuine success wins
          errors.push(`${p.name}:${r.error ?? 'not_ok'}`);
        } catch (e) {
          errors.push(`${p.name}:${e instanceof Error ? e.message.slice(0, 60) : 'threw'}`);
        }
      }
      return { ok: false, error: `cascade_exhausted[${errors.join(' | ')}]` };
    },
  };
}
