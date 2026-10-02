/**
 * lib/studio/templateThumbs.ts — how a template card's `thumb` is loaded (components/studio/ui/TemplateGallery).
 *
 *   null / ''            → no picture: the card keeps its palette tile (the same 3:4 box, so nothing shifts when a
 *                          picture arrives later).
 *   '/templates/x.jpg'   → a picture we ship: next/image (resized, AVIF/WebP) with its real blur placeholder and the
 *                          content version from the generated map — `?v=<sha>`, so the year-long immutable cache on
 *                          versioned thumbnails (next.config.js) can never serve an old picture after a replacement.
 *                          A file the map does not know yet (the script not re-run) still loads, unversioned and
 *                          without a blur; lib/studio/templateThumbs.test.ts keeps the committed map current.
 *   anything else        → `remote` (the „My twin" card's 15-minute signed URL, a blob:/data: preview): a plain <img>.
 *                          ⚠️ NEVER THROUGH THE OPTIMIZER: /_next/image would keep a cached copy of a private face
 *                          reachable at a public URL long after its signed link expired.
 *
 * Pure and isomorphic: no React.
 */
import { TEMPLATE_THUMB_META } from './templateThumbs.generated';

export type TemplateThumb =
  | { kind: 'static'; src: string; blurDataURL?: string }
  | { kind: 'remote'; src: string };

/** A site path we serve from public/ — not a protocol-relative `//host` URL, which is somebody else's. */
export function isStaticThumb(thumb: string | null | undefined): thumb is string {
  return typeof thumb === 'string' && thumb.startsWith('/') && !thumb.startsWith('//');
}

export function templateThumb(thumb: string | null | undefined): TemplateThumb | null {
  if (!thumb) return null;
  if (!isStaticThumb(thumb)) return { kind: 'remote', src: thumb };
  const meta = Object.prototype.hasOwnProperty.call(TEMPLATE_THUMB_META, thumb) ? TEMPLATE_THUMB_META[thumb] : undefined;
  return meta ? { kind: 'static', src: `${thumb}?v=${meta.v}`, blurDataURL: meta.blur } : { kind: 'static', src: thumb };
}
