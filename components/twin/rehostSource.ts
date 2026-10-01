/**
 * components/twin/rehostSource.ts — read the bytes a studio send path is about to RE-HOST (OmniStudio uploadBigFile),
 * and refuse anything that is not the media it claims to be.
 *
 * ⚠️ AN ERROR BODY IS NOT A FACE. The "My twin" card's face is a 15-minute signed URL. Picked, then sent after it
 * lapsed (or after the twin was deleted), storage answers 400 with a small JSON body — and a plain `fetch().blob()`
 * re-hosted that JSON as "image/jpeg" and handed it to the avatar render as the face. The status and the body type are
 * checked here, so the caller can say what happened instead of paying for a render of an error message.
 *
 * Generic on purpose (data: URLs, /public presets, signed URLs); it lives beside the twin card that needed it.
 */

export class RehostSourceError extends Error {
  constructor(
    readonly reason: 'status' | 'type',
    readonly status?: number,
  ) {
    super(`rehost source: ${reason}${status ? ` ${status}` : ''}`);
    this.name = 'RehostSourceError';
  }
}

/** `image/jpeg; charset=…` → `image`. */
function majorType(mime: string | null | undefined): string {
  return (mime ?? '').split(';')[0]!.trim().toLowerCase().split('/')[0] ?? '';
}

/**
 * The source's bytes — or a RehostSourceError: a non-2xx answer ('status'), or a body whose type is not the expected
 * kind of media ('type': JSON, HTML or text where an image/audio/video was expected). A body with no type is let
 * through (nothing to judge it by); the render's own checks still apply.
 */
export async function fetchRehostSource(src: string, expectedMime: string, fetchImpl: typeof fetch = fetch): Promise<Blob> {
  const res = await fetchImpl(src);
  if (!res.ok) throw new RehostSourceError('status', res.status);
  const blob = await res.blob();
  const want = majorType(expectedMime);
  const got = majorType(blob.type || res.headers?.get?.('content-type'));
  if (got && ['image', 'audio', 'video'].includes(want) && got !== want) throw new RehostSourceError('type');
  return blob;
}

/** A signed URL into the private `twins` bucket — i.e. the "My twin" face. */
export function isTwinSignedUrl(src: string | null | undefined): boolean {
  return typeof src === 'string' && src.includes('/storage/v1/object/sign/twins/');
}
