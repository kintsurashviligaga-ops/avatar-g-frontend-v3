import { DIRECT_CLIP_PHOTO_MAX_BYTES, base64Bytes } from '@/lib/video/directClip';

/** A JPEG's quality, tried in turn until the photo is under the route's ceiling (a busy 1280 px frame can pass 1 MB at 0.86). */
const QUALITIES = [0.86, 0.75, 0.62] as const;

/**
 * A photo as POST /api/video/clip takes it: a JPEG data URL, its longest side at most 1280 px and its bytes under the
 * route's ceiling (DIRECT_CLIP_PHOTO_MAX_BYTES, 1 MB: three of them fit the request). A photo from this chat's thread or
 * the Library can be a link to our storage: it is fetched and drawn the same way. Browser-only; null when the picture
 * cannot be read or made small enough, never a throw.
 */
export async function toClipPhoto(src: string, maxDim = 1280, maxBytes = DIRECT_CLIP_PHOTO_MAX_BYTES): Promise<string | null> {
  if (typeof document === 'undefined' || !src) return null;
  let objectUrl: string | null = null;
  try {
    let url = src;
    if (/^https?:\/\//i.test(src)) {
      const res = await fetch(src, { credentials: 'omit' });
      if (!res.ok) return null;
      objectUrl = URL.createObjectURL(await res.blob());
      url = objectUrl;
    } else if (!src.startsWith('data:image/')) {
      return null;
    }
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) return null;
    const scale = Math.min(1, maxDim / Math.max(w0, h0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // A transparent PNG becomes a JPEG: its see-through parts are white, not black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of QUALITIES) {
      const out = canvas.toDataURL('image/jpeg', q);
      if (!out.startsWith('data:image/jpeg;base64,')) return null;
      if (base64Bytes(out.slice(out.indexOf(',') + 1)) <= maxBytes) return out;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
