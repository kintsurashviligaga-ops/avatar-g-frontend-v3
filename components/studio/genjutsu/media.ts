/**
 * components/studio/genjutsu/media.ts — what the BROWSER does to a photo or a video before it ever leaves the device:
 * refuse what an engine cannot read (with a reason the panel can say), downscale a photo to ≤ 1280 px, and measure a
 * video's length with an HTMLVideoElement. The decisions (planDownscale, checkPhotoFile, checkVideoFile, judgeDuration)
 * are pure and unit-tested; the two functions that touch a canvas / a media element are thin wrappers around them.
 *
 * The server measures again (lib/genjutsu/mp4Duration) — this is the early, friendly refusal, not the enforcement.
 */
import {
  REFERENCE_INPUT_MAX_BYTES, REFERENCE_JPEG_QUALITY, REFERENCE_MAX_EDGE_PX, REFERENCE_MIMES, REFERENCE_MIN_EDGE_PX,
  SOURCE_VIDEO_MAX_BYTES, SOURCE_VIDEO_MAX_SEC, SOURCE_VIDEO_MIMES, SOURCE_VIDEO_MIN_SEC,
} from '@/lib/genjutsu/limits';

// ─── photos ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type PhotoRefusal = 'type' | 'size';

/** MIME (or, when a browser reports none, the extension) and size — before a single pixel is decoded. */
export function checkPhotoFile(file: { name: string; type: string; size: number }): PhotoRefusal | null {
  const type = (file.type || '').toLowerCase();
  const byExt = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!(REFERENCE_MIMES.includes(type) || (!type && byExt))) return 'type';
  if (file.size > REFERENCE_INPUT_MAX_BYTES || file.size <= 0) return 'size';
  return null;
}

/** The size to draw at: the longest edge ≤ `maxEdge`, never enlarged, aspect kept, whole pixels. */
export function planDownscale(width: number, height: number, maxEdge: number = REFERENCE_MAX_EDGE_PX): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** An image whose short edge is below the engines' floor is refused after decoding (we only know its size then). */
export const isTooSmall = (width: number, height: number): boolean => Math.min(width, height) < REFERENCE_MIN_EDGE_PX;

export type DownscaleResult =
  | { ok: true; blob: Blob; width: number; height: number }
  | { ok: false; reason: 'unreadable' | 'small' };

/**
 * Decodes (honouring EXIF orientation), flattens any transparency onto white, and re-encodes as a JPEG ≤ 1280 px. Falls
 * back from createImageBitmap to an <img> for browsers without it. Never throws: a photo that cannot be decoded (a HEIC in
 * Chrome, a corrupt file) is `unreadable`, and the panel names it.
 */
export async function downscaleImage(file: File): Promise<DownscaleResult> {
  try {
    const decoded = await decode(file);
    if (!decoded) return { ok: false, reason: 'unreadable' };
    const { source, width: w, height: h, close } = decoded;
    try {
      if (isTooSmall(w, h)) return { ok: false, reason: 'small' };
      const { width, height } = planDownscale(w, h);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { ok: false, reason: 'unreadable' };
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(source, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', REFERENCE_JPEG_QUALITY));
      return blob && blob.size > 0 ? { ok: true, blob, width, height } : { ok: false, reason: 'unreadable' };
    } finally {
      close();
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

interface Decoded { source: CanvasImageSource; width: number; height: number; close: () => void }

async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img) {
      URL.revokeObjectURL(url);
      return null;
    }
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

// ─── the source video ───────────────────────────────────────────────────────────────────────────────────────────

export type VideoRefusal = 'type' | 'size';

export function checkVideoFile(file: { name: string; type: string; size: number }): VideoRefusal | null {
  const type = (file.type || '').toLowerCase();
  const byExt = /\.(mp4|mov|m4v)$/i.test(file.name);
  if (!(SOURCE_VIDEO_MIMES.includes(type) || (!type && byExt))) return 'type';
  if (file.size > SOURCE_VIDEO_MAX_BYTES || file.size <= 0) return 'size';
  return null;
}

/** 3–30 s, on the browser's own measure (the server's tolerance is wider, the user's rule is not). */
export function judgeDuration(durationSec: number): 'ok' | 'short' | 'long' | 'unreadable' {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 'unreadable';
  if (durationSec < SOURCE_VIDEO_MIN_SEC) return 'short';
  if (durationSec > SOURCE_VIDEO_MAX_SEC) return 'long';
  return 'ok';
}

/** "12.4" — one decimal, trailing .0 dropped, for the friendly "That video is 41 s" line. */
export function formatSeconds(sec: number): string {
  const r = Math.round(sec * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Reads a video's length and frame size from its metadata only (no decoding of frames). null = the browser cannot read it. */
export function probeVideo(file: File, timeoutMs = 10_000): Promise<{ durationSec: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    let settled = false;
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    const done = (v: { durationSec: number; width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0 ? { durationSec: el.duration, width: el.videoWidth, height: el.videoHeight } : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}
