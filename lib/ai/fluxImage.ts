/**
 * FLUX 1.1 Pro — general-purpose text-to-image (Replicate, synchronous).
 * ======================================================================
 *
 * The owner-chosen quality tier for the image FALLBACK (2026-07-11): when the
 * primary image engine (NanoBanana) and the Grok backup both miss, fall back to
 * FLUX 1.1 Pro rather than nothing. A direct `Prefer: wait` call keeps it a clean
 * one-shot (no create+poll dance). Fail-open: any miss returns null so the caller
 * degrades exactly as before (the 502 still fires when every leg is exhausted).
 *
 * NOTE this is a shared helper, deliberately prompt-neutral (unlike
 * lib/pipeline/anchorFrame.ts's private runFluxPro, which bakes in a
 * character-portrait suffix). Callers pass the already-composed prompt.
 */

const FLUX_ASPECTS = new Set(['1:1', '16:9', '21:9', '3:2', '2:3', '4:5', '5:4', '9:16', '9:21', '3:4', '4:3']);

function pickImageUrl(output: unknown): string | null {
  if (typeof output === 'string' && /^https?:\/\//i.test(output)) return output;
  if (Array.isArray(output)) {
    const first = output.find((o) => typeof o === 'string' && /^https?:\/\//i.test(o));
    return typeof first === 'string' ? first : null;
  }
  return null;
}

/**
 * Generate one image with FLUX 1.1 Pro. Returns a raw provider URL (the caller
 * re-hosts it to durable storage), or null on any failure / missing token.
 */
export async function generateFluxProImage(prompt: string, aspectRatio?: string): Promise<string | null> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null; // leg simply unavailable → caller falls through
  const aspect_ratio = aspectRatio && FLUX_ASPECTS.has(aspectRatio) ? aspectRatio : '1:1';
  try {
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait' },
      cache: 'no-store',
      body: JSON.stringify({
        input: {
          prompt: prompt.slice(0, 1500),
          aspect_ratio,
          output_format: 'jpg',
          output_quality: 90,
          prompt_upsampling: true,
          safety_tolerance: 2,
        },
      }),
      // Bound the wait so a slow provider can't stall the function to its gateway limit.
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { status?: string; output?: unknown };
    return j.status === 'succeeded' ? pickImageUrl(j.output) : null;
  } catch {
    return null; // fail-open — the caller degrades to its next leg / 502
  }
}
