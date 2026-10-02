/**
 * Pricing for Higgsfield's TOKEN-priced video models (Seedance 2.5), which do not price a request.
 *
 * Verified 2026-09-29: `POST /estimate/bytedance/seedance-2.5/{text,image,reference}-to-video` answers
 *   {"type":"description","pricing_description":"For 16:9 video without video input, your request costs roughly
 *    $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p. Each 1,000 video
 *    tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p. Billable video tokens = ceil(output height ×
 *    output width × (input video duration + generated video duration) × 24 / 1024). … Rates shown are before any
 *    applicable customer discount."}
 * — the same text whatever aspect ratio or duration is sent. So the price is computed here, from that text when
 * it parses and from the same numbers (recorded above) when it does not.
 *
 * Deliberately never BELOW cost:
 *   - the rates are the provider's pre-discount rates (the live discount is kept as margin, not passed on blind);
 *   - output pixel sizes are published only for 16:9, so any other aspect is priced at max(16:9 rate, the rate
 *     its assumed size implies) — 1:1 is never cheaper than 16:9, and a wide 21:9 costs more;
 *   - a video INPUT also counts its duration, which cannot be known before fetching it, so the reference-to-video
 *     schema accepts image and audio references only (lib/providers/higgsfield/models.ts).
 */

type Resolution = '480p' | '720p' | '1080p';

/** The 2026-09-29 numbers, used when the description does not parse. */
export const FALLBACK_PER_SECOND_16x9: Readonly<Record<Resolution, number>> = { '480p': 0.2056, '720p': 0.4622, '1080p': 1.1372 };
export const FALLBACK_PER_1K_TOKENS: Readonly<Record<Resolution, number>> = { '480p': 0.0214, '720p': 0.0214, '1080p': 0.0234 };

const HEIGHT: Record<Resolution, number> = { '480p': 480, '720p': 720, '1080p': 1080 };
const RATIO: Record<string, number> = { '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '3:4': 3 / 4, '9:16': 9 / 16, '21:9': 21 / 9 };

const asResolution = (v: unknown): Resolution => (v === '480p' || v === '1080p' ? v : '720p');

/** "$0.2056 per second … at 480p, $0.4622 at 720p, and $1.1372 at 1080p" → per-second 16:9 rates. */
export function parsePerSecond16x9(description: string | null): Record<Resolution, number> | null {
  if (!description) return null;
  const m = description.match(/\$([0-9]*\.?[0-9]+)\s+per second[^$]*?at\s+480p,\s*\$([0-9]*\.?[0-9]+)\s+at\s+720p,?\s*(?:and\s+)?\$([0-9]*\.?[0-9]+)\s+at\s+1080p/i);
  if (!m) return null;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return [a, b, c].every((n) => Number.isFinite(n) && n > 0) ? { '480p': a, '720p': b, '1080p': c } : null;
}

/** "Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p". */
export function parsePer1kTokens(description: string | null): Record<Resolution, number> | null {
  if (!description) return null;
  const m = description.match(/1,?000 video tokens costs\s+\$([0-9]*\.?[0-9]+)\s+at\s+480p or 720p and\s+\$([0-9]*\.?[0-9]+)\s+at\s+1080p/i);
  if (!m) return null;
  const [low, high] = [Number(m[1]), Number(m[2])];
  return low > 0 && high > 0 ? { '480p': low, '720p': low, '1080p': high } : null;
}

/**
 * USD for one generation of `duration` seconds at `resolution` / `aspect_ratio` (no video input), rounded UP to
 * a hundredth of a cent. null when the input has no usable duration.
 */
export function videoTokensUsd(input: Record<string, unknown>, description: string | null): number | null {
  const duration = Number(input.duration ?? 5);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const res = asResolution(input.resolution);
  const perSecond16x9 = (parsePerSecond16x9(description) ?? FALLBACK_PER_SECOND_16x9)[res];
  const per1k = (parsePer1kTokens(description) ?? FALLBACK_PER_1K_TOKENS)[res];

  const ratio = RATIO[String(input.aspect_ratio ?? '16:9')] ?? RATIO['16:9']!;
  const h = HEIGHT[res];
  const [w, hh] = ratio >= 1 ? [Math.round(h * ratio), h] : [h, Math.round(h / ratio)];
  const perSecondAspect = ((w * hh * 24) / 1024 / 1000) * per1k;

  const usd = Math.max(perSecond16x9, perSecondAspect) * duration;
  return Math.ceil(usd * 10_000) / 10_000;
}

/**
 * Seedance 2.5 image→video: the output takes the PHOTO's shape, which is not known before the provider fetches it. So it is
 * costed at the widest shape the family renders (21:9 — the most pixels per second at a given height), never below cost: a
 * 16:9 or 9:16 photo is costed at the 21:9 ceiling, a 21:9 one exactly at its own. Same verified rates as `videoTokensUsd`.
 */
export function seedanceI2vUsd(input: Record<string, unknown>, description: string | null): number | null {
  return videoTokensUsd({ ...input, aspect_ratio: '21:9' }, description);
}
