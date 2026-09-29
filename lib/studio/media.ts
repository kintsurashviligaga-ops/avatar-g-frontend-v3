/**
 * Reference media for a studio generation (brief §6: "refs 0/5").
 *
 * The browser uploads a file STRAIGHT to our `uploads` bucket through /api/upload/sign (a serverless body caps
 * out near 4.5 MB; a reference video is tens of MB) and gets back a storage PATH — `omni-uploads/<uid>/…`.
 * Higgsfield needs a public HTTPS URL it can fetch, so before a model schema ever sees the params, every
 * media field holding one of OUR paths is swapped for a signed read URL.
 *
 * Why our storage and not Higgsfield's presigned upload (which the brief names): the browser would have to
 * PUT cross-origin to a storage host we cannot know until the account is live — its CORS and our CSP both
 * unverified — while this path is already in production and keeps the user's originals with us (D6).
 * `createUpload` stays in the adapter for when that host is known.
 *
 * SECURITY: a path must sit under the CALLER's own prefix. Upload paths are unguessable, but "unguessable"
 * is not "authorised" — another user's path is refused, not signed. Anything that is already a URL passes
 * through untouched and meets the model schema's public-https check like any other input.
 */

export const UPLOAD_PREFIX = 'omni-uploads';
/** Long enough for the slowest model to fetch its reference (Motion Control ≤ 30 min) with margin. */
export const REFERENCE_URL_TTL_SEC = 6 * 60 * 60;

const SINGLE_KEYS = ['image_url', 'last_image_url', 'video_url'] as const;
const LIST_KEYS = ['image_urls', 'video_urls', 'audio_urls'] as const;

export type Signer = (path: string, expiresSec: number) => Promise<string | null>;

export class MediaRefError extends Error {
  constructor(readonly field: string, readonly reason: 'not_owner' | 'unavailable') {
    super(`${field}: ${reason}`);
    this.name = 'MediaRefError';
  }
}

const isPath = (v: string) => !/^[a-z][a-z0-9+.-]*:/i.test(v);

async function resolveOne(value: unknown, field: string, userId: string, sign: Signer): Promise<unknown> {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  if (!v || !isPath(v)) return value;
  const clean = v.replace(/^\/+/, '');
  if (!clean.startsWith(`${UPLOAD_PREFIX}/${userId}/`) || clean.includes('..')) throw new MediaRefError(field, 'not_owner');
  const url = await sign(clean, REFERENCE_URL_TTL_SEC).catch(() => null);
  if (!url) throw new MediaRefError(field, 'unavailable');
  return url;
}

/** Returns a copy of `params` with every owned upload path replaced by a signed URL. */
export async function resolveStudioMedia(params: unknown, userId: string, sign: Signer): Promise<unknown> {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
  const out: Record<string, unknown> = { ...(params as Record<string, unknown>) };
  for (const k of SINGLE_KEYS) {
    if (k in out) out[k] = await resolveOne(out[k], k, userId, sign);
  }
  for (const k of LIST_KEYS) {
    const list = out[k];
    if (Array.isArray(list)) out[k] = await Promise.all(list.map((v, i) => resolveOne(v, `${k}.${i}`, userId, sign)));
  }
  return out;
}
