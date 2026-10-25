/**
 * A photo as POST /api/video/clip takes it: a JPEG data URL, its longest side at most 1280 px (a few hundred KB; the route's
 * ceiling is 1.5 MB a photo). A photo from this chat's thread or the Library can be a link to our storage: it is fetched
 * and drawn the same way. Browser-only; null when the picture cannot be read, never a throw.
 */
export async function toClipPhoto(src: string, maxDim = 1280): Promise<string | null> {
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
    const out = canvas.toDataURL('image/jpeg', 0.86);
    return out.startsWith('data:image/jpeg;base64,') ? out : null;
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
