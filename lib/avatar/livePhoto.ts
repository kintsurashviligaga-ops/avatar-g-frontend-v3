/**
 * lib/avatar/livePhoto.ts — what a Live-Avatar photo becomes before it is stored: checked, turned upright, stripped of
 * its metadata, and (when the source is big enough) cut into the portrait Google's custom Live Avatar takes.
 *
 * ⚠️ THE BYTES DECIDE, NOT THE LABEL. The browser names the type in the data URL; the first bytes must say the same
 * (an HTML page labelled image/jpeg is refused), and sharp must decode the whole image.
 *
 * ⚠️ NOTHING OF THE CAMERA SURVIVES. sharp writes no metadata unless asked, so EXIF (GPS, device, time) is dropped by
 * the re-encode; `.rotate()` first applies the EXIF orientation, so a phone photo is stored upright.
 *
 * ⚠️ NO UPSCALING. Google's custom avatar wants 9:16, at least 704×1280, under 5 MB, RGB, PNG preferred. A 9:16 cut at
 * the source's own resolution that falls short is reported as `too_small`, never enlarged into a blurry face.
 * Whether the picture shows a clear face and shoulders is NOT checked here (no face model on the server):
 * `faceChecked: false` says so, and the capture screen frames the shot instead.
 */
import 'server-only';
import sharp from 'sharp';

import { sniffMime } from '@/lib/twin/validate';

export const LIVE_PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const LIVE_PHOTO_LIMITS = {
  minBytes: 2 * 1024,
  maxBytes: 8 * 1024 * 1024,
  /** Shorter edge: below this nothing usable is left of a face. */
  minEdgePx: 256,
  /** Decompression-bomb guard: a 12 MP phone photo is ~12e6 pixels. */
  maxInputPixels: 50_000_000,
  /** The stored photo's longer edge (what the app shows). */
  photoMaxEdgePx: 1920,
} as const;

/** Google's custom Live Avatar reference image (Gemini 3.8 Live Avatar). */
export const CUSTOM_AVATAR_SPEC = {
  minWidth: 704,
  minHeight: 1280,
  maxBytes: 5 * 1024 * 1024,
  /** Exact 9:16 outputs, largest first; the first one the source covers without upscaling wins. */
  sizes: [
    { width: 1080, height: 1920 },
    { width: 720, height: 1280 },
  ],
} as const;

export type CustomPrepReason = 'too_small' | 'too_large';

export interface PreparedImage {
  bytes: Buffer;
  mime: string;
  width: number;
  height: number;
}

export interface PreparedLivePhoto {
  photo: PreparedImage;
  custom: PreparedImage | null;
  prep: { ok: boolean; reasons: CustomPrepReason[]; faceChecked: false };
  source: { width: number; height: number };
}

export type LivePhotoError = { status: 400 | 413 | 415; error: 'no_image' | 'too_small' | 'too_large' | 'unsupported_type' | 'content_mismatch' | 'undecodable' };

/** `data:image/png;base64,…` → its bytes and declared type, or null. */
export function decodeImageDataUrl(dataUrl: unknown): { mime: string; bytes: Buffer } | null {
  const m = typeof dataUrl === 'string' ? dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/) : null;
  if (!m) return null;
  return { mime: m[1]!.trim().toLowerCase(), bytes: Buffer.from(m[2]!, 'base64') };
}

/** The 9:16 rectangle centred in a w×h image (the largest one that fits). */
export function portraitCrop(w: number, h: number): { left: number; top: number; width: number; height: number } {
  if (w * 16 > h * 9) {
    const width = Math.floor((h * 9) / 16);
    return { left: Math.floor((w - width) / 2), top: 0, width, height: h };
  }
  const height = Math.floor((w * 16) / 9);
  return { left: 0, top: Math.floor((h - height) / 2), width: w, height };
}

/** Check the bytes, then build the stored photo and (if possible) the custom-avatar portrait. */
export async function prepareLivePhoto(declaredMime: string, bytes: Buffer): Promise<PreparedLivePhoto | LivePhotoError> {
  if (!bytes.byteLength) return { status: 400, error: 'no_image' };
  if (!(LIVE_PHOTO_MIMES as readonly string[]).includes(declaredMime)) return { status: 415, error: 'unsupported_type' };
  if (bytes.byteLength < LIVE_PHOTO_LIMITS.minBytes) return { status: 400, error: 'too_small' };
  if (bytes.byteLength > LIVE_PHOTO_LIMITS.maxBytes) return { status: 413, error: 'too_large' };
  if (sniffMime(bytes.subarray(0, 16)) !== declaredMime) return { status: 415, error: 'content_mismatch' };

  let width: number;
  let height: number;
  try {
    const meta = await sharp(bytes, { limitInputPixels: LIVE_PHOTO_LIMITS.maxInputPixels }).metadata();
    if (!meta.width || !meta.height) return { status: 415, error: 'undecodable' };
    // Orientations 5–8 turn the picture a quarter: the upright image is h×w.
    const turned = (meta.orientation ?? 1) >= 5;
    width = turned ? meta.height : meta.width;
    height = turned ? meta.width : meta.height;
  } catch {
    return { status: 415, error: 'undecodable' };
  }
  if (Math.min(width, height) < LIVE_PHOTO_LIMITS.minEdgePx) return { status: 400, error: 'too_small' };

  const upright = () => sharp(bytes, { limitInputPixels: LIVE_PHOTO_LIMITS.maxInputPixels, failOn: 'error' }).rotate().toColourspace('srgb');

  let photo: PreparedImage;
  try {
    const { data, info } = await upright()
      .resize({ width: LIVE_PHOTO_LIMITS.photoMaxEdgePx, height: LIVE_PHOTO_LIMITS.photoMaxEdgePx, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#000000' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    photo = { bytes: data, mime: 'image/jpeg', width: info.width, height: info.height };
  } catch {
    return { status: 415, error: 'undecodable' };
  }

  const reasons: CustomPrepReason[] = [];
  let custom: PreparedImage | null = null;
  const crop = portraitCrop(width, height);
  const sizes = CUSTOM_AVATAR_SPEC.sizes.filter((s) => crop.width >= s.width && crop.height >= s.height);
  if (!sizes.length) reasons.push('too_small');
  for (const size of sizes) {
    const data = await upright()
      .extract(crop)
      .resize(size.width, size.height)
      .flatten({ background: '#000000' })
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer();
    if (data.byteLength < CUSTOM_AVATAR_SPEC.maxBytes) {
      custom = { bytes: data, mime: 'image/png', ...size };
      break;
    }
  }
  if (sizes.length && !custom) reasons.push('too_large');

  return { photo, custom, prep: { ok: custom !== null, reasons, faceChecked: false }, source: { width, height } };
}
