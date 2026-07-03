/**
 * Ad-generator input validation — STEP 2.1. Single source of truth shared by the
 * client (pre-submit UX) AND the server (authoritative reject — never trust the client).
 * Framework-free + zod, so it's unit-testable and importable from both layers.
 */
import { z } from 'zod';

/** HARD limits (the marketing hook cap is a product requirement, enforced both sides). */
export const AD_HOOK_MAX_CHARS = 60;
export const AD_BRAND_MAX_CHARS = 60;
export const AD_PRICE_MAX_CHARS = 40;
export const MAX_AD_IMAGES = 3;
export const AD_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB each
export const AD_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AdImageMime = (typeof AD_IMAGE_MIME)[number];

/** Text inputs. Hook is required (drives the whole ad); brand/price optional. */
export const adInputsSchema = z.object({
  brand: z.string().trim().max(AD_BRAND_MAX_CHARS, `Brand must be ≤ ${AD_BRAND_MAX_CHARS} chars`).optional().default(''),
  price: z.string().trim().max(AD_PRICE_MAX_CHARS, `Price/badge must be ≤ ${AD_PRICE_MAX_CHARS} chars`).optional().default(''),
  hook: z
    .string()
    .trim()
    .min(1, 'Marketing hook is required')
    .max(AD_HOOK_MAX_CHARS, `Marketing hook must be ≤ ${AD_HOOK_MAX_CHARS} chars`),
});
export type AdInputs = z.infer<typeof adInputsSchema>;

export type Validation = { ok: true } | { ok: false; error: string };

export function isAdImageMime(mime: string | null | undefined): mime is AdImageMime {
  return typeof mime === 'string' && (AD_IMAGE_MIME as readonly string[]).includes(mime.toLowerCase().trim());
}

/** One image file's metadata (mime + byte size). Used server-side per uploaded file. */
export function validateAdImageMeta(input: { contentType?: string | null; sizeBytes?: number | null }): Validation {
  if (!isAdImageMime(input.contentType)) {
    return { ok: false, error: `Unsupported image type. Allowed: ${AD_IMAGE_MIME.join(', ')}` };
  }
  const size = Number(input.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'Empty or unreadable image' };
  if (size > AD_IMAGE_MAX_BYTES) {
    return { ok: false, error: `Image too large (${(size / 1024 / 1024).toFixed(1)}MB); max ${AD_IMAGE_MAX_BYTES / 1024 / 1024}MB` };
  }
  return { ok: true };
}

/** How many images the request carries (≤ MAX_AD_IMAGES). */
export function validateAdImageCount(count: number): Validation {
  if (!Number.isFinite(count) || count < 0) return { ok: false, error: 'Invalid image count' };
  if (count > MAX_AD_IMAGES) return { ok: false, error: `At most ${MAX_AD_IMAGES} images` };
  return { ok: true };
}

/** Byte length of a base64 payload (data-URL bodies arrive base64 — size-check without decoding). */
export function base64ByteLength(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/** Parse+validate ad text inputs; returns a flat error string on failure (route-friendly). */
export function parseAdInputs(raw: unknown): { ok: true; data: AdInputs } | { ok: false; error: string } {
  const r = adInputsSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error.issues.map((i) => i.message).join('; ') };
}
