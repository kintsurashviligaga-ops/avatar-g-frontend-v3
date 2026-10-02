/**
 * Reading a room / product / portrait photo for the two image tools: validate, downscale, remember its shape.
 *
 * ⚠️ DOWNSCALED BEFORE IT TRAVELS. A phone photo is 3–12 MB; the image route takes ONE reference per render in a JSON body
 * (the platform's body limit is ~4.5 MB) and hosts it for the provider. The picture is only a guide for the render — the
 * output is made at full tier — so the longest side is brought to ≤ 1280 px as a JPEG, exactly like the image tool's own
 * attachments (OmniStudio.downscaleDataUrl). Fail-open to the original when the canvas cannot be had.
 *
 * `w` × `h` are the ORIGINAL dimensions: the Interior designer's „Auto" ratio is the photo's own shape.
 */

export const PHOTO_MAX_BYTES = 12 * 1024 * 1024;
export const PHOTO_MAX_DIM = 1280;

export type PhotoCheck = 'ok' | 'type' | 'size';

/** Only a picture can be a reference: an image, not a vector (an SVG is a document with scripts), and not absurdly large. */
export function checkPhotoFile(f: { type: string; size: number }): PhotoCheck {
  if (!/^image\/(?!svg)/i.test(f.type || '')) return 'type';
  if (!(f.size > 0) || f.size > PHOTO_MAX_BYTES) return 'size';
  return 'ok';
}

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => (typeof r.result === 'string' ? resolve(r.result) : reject(new Error('unreadable')));
    r.onerror = () => reject(r.error ?? new Error('unreadable'));
    r.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('undecodable'));
    el.src = src;
  });

export interface ReadPhoto { src: string; w: number; h: number }

/** A file → a downscaled data URL and its original shape. Rejects when the file is not a decodable picture. */
export async function readPhoto(file: File, maxDim = PHOTO_MAX_DIM): Promise<ReadPhoto> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!(w > 0) || !(h > 0)) throw new Error('undecodable');
  const scale = Math.min(1, maxDim / Math.max(w, h));
  if (scale >= 1 && original.length < 3_000_000) return { src: original, w, h };
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { src: original, w, h };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { src: canvas.toDataURL('image/jpeg', 0.85), w, h };
  } catch {
    return { src: original, w, h };
  }
}
