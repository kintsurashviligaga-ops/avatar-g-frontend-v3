/**
 * lib/pipeline/anchorFrame.ts — auto character-anchor frame (Pipeline Iteration).
 *
 * Kling (and LTX-2) clip generation is IMAGE-to-video: it needs a start frame. A
 * text-only brief with no uploaded character photo has none, so clips fall to LTX
 * text-to-video. This generates ONE photorealistic character portrait from the Prompt
 * Agent's character description, to use as the i2v start image for EVERY clip — so the
 * premium i2v path fires AND every clip shares one identity (character consistency).
 *
 * QUALITY TIERS (the anchor is a SINGLE image whose quality propagates to every Kling
 * clip, so it is worth the extra spend):
 *   - 'high' (DEFAULT) → FLUX 1.1 Pro: sharper faces, far more photoreal (~3.7s,
 *     ~$0.04/img). prompt_upsampling on. This is the i2v seed → better clips.
 *   - 'fast'           → flux-schnell (~3.65s, ~$0.003/img) — the prior behaviour.
 * Tier resolves from the `quality` arg, else `ANCHOR_MODEL` env (`fast`/`schnell` →
 * fast; anything else → high). FLUX 1.1 Pro is tried FIRST when high and FAILS OPEN to
 * flux-schnell on any miss, so the premium tier can only improve the anchor, never
 * break it.
 *
 * Raw fetch (no new dep) with `Prefer: wait` + a 429 backoff; re-hosted to a stable
 * signed Supabase URL (a replicate.delivery URL expires, and i2v must fetch the anchor).
 * STRICTLY fail-open: any miss returns null → the caller keeps its existing (LTX) path.
 */
import 'server-only';
import { withRetry } from '@/lib/utils/withRetry';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

export type AnchorAspect = '9:16' | '16:9' | '1:1';
export type ImageQuality = 'fast' | 'high';

/** Pull the first usable http(s) URL out of whatever shape a Replicate model returned
 *  (flux-schnell → string[], flux-1.1-pro → string). */
function pickUrl(o: unknown): string | null {
  return typeof o === 'string' && /^https?:\/\//.test(o)
    ? o
    : Array.isArray(o)
      ? pickUrl(o[o.length - 1])
      : null;
}

/** Resolve the effective quality tier: explicit arg wins, else ANCHOR_MODEL env, else high. */
function resolveQuality(quality?: ImageQuality): ImageQuality {
  if (quality) return quality;
  return /^(fast|schnell)$/i.test((process.env.ANCHOR_MODEL || '').trim()) ? 'fast' : 'high';
}

/** HIGH tier — FLUX 1.1 Pro. Returns a raw provider URL, or null (fail-open → schnell). */
async function runFluxPro(desc: string, aspect_ratio: AnchorAspect, token: string): Promise<string | null> {
  const prompt =
    `${desc.slice(0, 1500)}, cinematic character portrait, head and shoulders, facing camera directly, ` +
    `clean simple background, photorealistic, sharp focus, soft cinematic lighting, 8k, highly detailed skin`;
  try {
    return await withRetry(async () => {
      const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait' },
        cache: 'no-store',
        body: JSON.stringify({
          input: { prompt, aspect_ratio, output_format: 'jpg', output_quality: 90, prompt_upsampling: true, safety_tolerance: 2 },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`flux-1.1-pro ${res.status}`);
      if (!res.ok) return null;
      const j = (await res.json().catch(() => ({}))) as { status?: string; output?: unknown };
      return j.status === 'succeeded' ? pickUrl(j.output) : null;
    }, { maxAttempts: 2, baseDelayMs: 1500, label: 'anchor-flux-pro' });
  } catch {
    return null; // FAIL-OPEN → the caller falls through to flux-schnell
  }
}

/** FAST tier — flux-schnell. Returns a raw provider URL, or null. */
async function runFluxSchnell(desc: string, aspect_ratio: AnchorAspect, token: string): Promise<string | null> {
  const prompt =
    `${desc.slice(0, 1500)}, cinematic character portrait, head and shoulders, facing camera, ` +
    `clean simple background, photorealistic, sharp focus, soft cinematic lighting, 4k`;
  try {
    return await withRetry(async () => {
      const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait' },
        cache: 'no-store',
        body: JSON.stringify({ input: { prompt, aspect_ratio, num_outputs: 1, output_format: 'jpg' } }),
        signal: AbortSignal.timeout(40_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`flux-schnell ${res.status}`);
      if (!res.ok) return null;
      const j = (await res.json().catch(() => ({}))) as { status?: string; output?: unknown };
      return j.status === 'succeeded' ? pickUrl(j.output) : null;
    }, { maxAttempts: 2, baseDelayMs: 1500, label: 'anchor-frame' });
  } catch {
    return null;
  }
}

/** Re-host a raw provider URL to a stable, CSP-safe signed Supabase URL (the raw
 *  replicate.delivery URL expires, and i2v must fetch the anchor). Returns the raw URL
 *  unchanged on any re-host miss (it is still valid for the imminent render). */
async function reHostAnchor(raw: string): Promise<string> {
  try {
    const r = await fetch(raw, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return raw;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < 512) return raw;
    const path = `film-anchor/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const signed = await uploadAndSign('uploads', path, buf.toString('base64'), 'image/jpeg', 604800);
    return signed || raw;
  } catch {
    return raw;
  }
}

/**
 * Generate ONE character-anchor portrait. Tries FLUX 1.1 Pro (high tier, default) and
 * fails open to flux-schnell, then re-hosts to a stable signed URL. Returns null only
 * when BOTH model tiers miss or no token/description is available — the caller then
 * keeps its existing (LTX text-to-video) path. Backward-compatible: the 3rd `quality`
 * arg is optional (existing 2-arg callers now default to the high tier).
 */
export async function generateAnchorFrame(
  characterDescription: string,
  aspect: AnchorAspect = '9:16',
  quality?: ImageQuality,
): Promise<string | null> {
  const token = (process.env.REPLICATE_API_TOKEN || '').trim();
  const desc = (characterDescription || '').trim();
  if (!token || !desc) return null;
  const aspect_ratio: AnchorAspect = aspect === '9:16' ? '9:16' : aspect === '1:1' ? '1:1' : '16:9';
  const tier = resolveQuality(quality);
  try {
    let raw: string | null = null;
    if (tier === 'high') raw = await runFluxPro(desc, aspect_ratio, token);
    if (!raw) raw = await runFluxSchnell(desc, aspect_ratio, token); // fail-open / fast tier
    if (!raw) return null;
    return await reHostAnchor(raw);
  } catch {
    return null;
  }
}
