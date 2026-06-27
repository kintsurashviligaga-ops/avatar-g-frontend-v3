/**
 * lib/pipeline/anchorFrame.ts — auto character-anchor frame (Pipeline Iteration).
 *
 * Kling (and LTX-2) clip generation is IMAGE-to-video: it needs a start frame. A
 * text-only brief with no uploaded character photo has none, so clips fall to LTX
 * text-to-video. This generates ONE photorealistic character portrait via Replicate
 * flux-schnell (~3.65s, benchmarked) from the Prompt Agent's character description, to
 * use as the i2v start image for EVERY clip — so the premium i2v path fires AND every
 * clip shares one identity (character consistency).
 *
 * Raw fetch (no new dep) with `Prefer: wait` + a 429 backoff; re-hosted to a stable
 * signed Supabase URL (a replicate.delivery URL expires, and i2v must fetch the anchor).
 * STRICTLY fail-open: any miss returns null → the caller keeps its existing (LTX) path.
 */
import 'server-only';
import { withRetry } from '@/lib/utils/withRetry';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

export type AnchorAspect = '9:16' | '16:9' | '1:1';

export async function generateAnchorFrame(
  characterDescription: string,
  aspect: AnchorAspect = '9:16',
): Promise<string | null> {
  const token = (process.env.REPLICATE_API_TOKEN || '').trim();
  const desc = (characterDescription || '').trim();
  if (!token || !desc) return null;
  const aspect_ratio: AnchorAspect = aspect === '9:16' ? '9:16' : aspect === '1:1' ? '1:1' : '16:9';
  const prompt =
    `${desc.slice(0, 1500)}, cinematic character portrait, head and shoulders, facing camera, ` +
    `clean simple background, photorealistic, sharp focus, soft cinematic lighting, 4k`;
  try {
    const raw = await withRetry(async () => {
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
      const pick = (o: unknown): string | null =>
        typeof o === 'string' && /^https?:\/\//.test(o) ? o : Array.isArray(o) ? pick(o[o.length - 1]) : null;
      return j.status === 'succeeded' ? pick(j.output) : null;
    }, { maxAttempts: 2, baseDelayMs: 1500, label: 'anchor-frame' });
    if (!raw) return null;

    // Re-host to a stable, CSP-safe signed Supabase URL (the raw provider URL expires).
    try {
      const r = await fetch(raw, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return raw;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.byteLength < 512) return raw;
      const path = `film-anchor/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const signed = await uploadAndSign('uploads', path, buf.toString('base64'), 'image/jpeg', 604800);
      return signed || raw;
    } catch {
      return raw; // re-host failed → the raw URL is still valid for the imminent render
    }
  } catch {
    return null;
  }
}
