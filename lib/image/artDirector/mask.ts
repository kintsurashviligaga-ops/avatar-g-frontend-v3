/**
 * lib/image/artDirector/mask.ts — region editing on a model that has no mask parameter. Server only (sharp).
 *
 * gemini-3.1-flash-image edits by instruction; it takes no mask. So:
 *  1. the user's brush becomes a binary mask at the base image's size (normaliseMask);
 *  2. the model gets the base image AND a copy with the masked area painted solid red (maskGuide) and is told to change
 *     only the red area (prompt.ts);
 *  3. after the answer, the base image is pasted back over everything OUTSIDE the mask (pasteBack). Pixels outside the
 *     brush are therefore byte-identical to the original whatever the model did there — a guarantee the model alone does
 *     not give. unmaskedDigest proves it (stored with the result, checked in tests).
 * Outpainting ("extend") is the same flow on a bigger canvas whose new area is the mask (extendCanvas).
 */
import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ratioValue, type ArtRatio } from './spec';

export interface RawImage { width: number; height: number; data: Buffer /* RGBA */ }
/** 1 byte per pixel: 255 = edit here, 0 = keep. */
export interface BinaryMask { width: number; height: number; data: Buffer }

/** Longest side of a canvas we build for "extend" (keeps a 4K request in bounds). */
export const MAX_CANVAS_SIDE = 4096;

export async function toRaw(img: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(img).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

export async function fromRaw(r: RawImage, format: 'png' | 'jpeg' = 'png', quality = 92): Promise<Buffer> {
  const s = sharp(r.data, { raw: { width: r.width, height: r.height, channels: 4 } });
  return format === 'png' ? s.png().toBuffer() : s.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer();
}

/**
 * The brush picture (PNG from the canvas: painted = opaque or white) → a binary mask at width × height.
 * A pixel is "edit" when its alpha ≥ 128 AND its luminance ≥ 128 (so a white-on-black and a paint-on-transparent export
 * both work). Returns null when nothing is painted (an empty brush is not a region edit).
 */
export async function normaliseMask(brush: Buffer, width: number, height: number): Promise<BinaryMask | null> {
  const { data } = await sharp(brush).ensureAlpha().resize(width, height, { fit: 'fill', kernel: 'nearest' }).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(width * height);
  let any = false;
  for (let i = 0, p = 0; p < out.length; p++, i += 4) {
    const lum = 0.2126 * (data[i] as number) + 0.7152 * (data[i + 1] as number) + 0.0722 * (data[i + 2] as number);
    if ((data[i + 3] as number) >= 128 && lum >= 128) { out[p] = 255; any = true; }
  }
  return any ? { width, height, data: out } : null;
}

/** Share of the picture the mask covers, 0…1. */
export function maskCoverage(m: BinaryMask): number {
  let n = 0;
  for (const v of m.data) if (v) n++;
  return n / m.data.length;
}

/** The base image with the masked area painted solid red: the model's "where" picture. PNG. */
export async function maskGuide(base: RawImage, m: BinaryMask): Promise<Buffer> {
  assertSameSize(base, m);
  const out = Buffer.from(base.data);
  for (let p = 0; p < m.data.length; p++) {
    if (!m.data[p]) continue;
    const i = p * 4;
    out[i] = 255; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 255;
  }
  return fromRaw({ ...base, data: out });
}

/**
 * The model's answer composited onto the original: masked pixels from `edited` (resized to the original's size), every
 * other pixel copied from `original` unchanged.
 */
export async function pasteBack(original: RawImage, edited: Buffer, m: BinaryMask): Promise<RawImage> {
  assertSameSize(original, m);
  const { data: e } = await sharp(edited).ensureAlpha().resize(original.width, original.height, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(original.data);
  for (let p = 0; p < m.data.length; p++) {
    if (!m.data[p]) continue;
    const i = p * 4;
    out[i] = e[i] as number; out[i + 1] = e[i + 1] as number; out[i + 2] = e[i + 2] as number; out[i + 3] = e[i + 3] as number;
  }
  return { width: original.width, height: original.height, data: out };
}

/** sha256 of every pixel OUTSIDE the mask: equal for original and pasted-back result = "the rest is identical". */
export function unmaskedDigest(img: RawImage, m: BinaryMask): string {
  assertSameSize(img, m);
  const h = createHash('sha256');
  const px = Buffer.alloc(4);
  for (let p = 0; p < m.data.length; p++) {
    if (m.data[p]) continue;
    img.data.copy(px, 0, p * 4, p * 4 + 4);
    h.update(px);
  }
  return h.digest('hex');
}

/**
 * Outpainting: the original centred on a larger canvas of `ratio`, the new area masked. The canvas is never smaller than
 * the original in either side; it is scaled down only when a side would exceed MAX_CANVAS_SIDE.
 */
export async function extendCanvas(original: RawImage, ratio: ArtRatio): Promise<{ canvas: RawImage; mask: BinaryMask; left: number; top: number }> {
  const r = ratioValue(ratio);
  let src = original;
  let W = Math.max(src.width, Math.round(src.height * r));
  let H = Math.max(src.height, Math.round(src.width / r));
  if (W === src.width && H === src.height) throw new Error('the image already has this ratio: nothing to extend');
  const scale = Math.min(1, MAX_CANVAS_SIDE / Math.max(W, H));
  if (scale < 1) {
    const w = Math.max(1, Math.floor(src.width * scale));
    const h = Math.max(1, Math.floor(src.height * scale));
    src = await toRaw(await sharp(src.data, { raw: { width: src.width, height: src.height, channels: 4 } }).resize(w, h, { fit: 'fill' }).png().toBuffer());
    W = Math.min(MAX_CANVAS_SIDE, Math.max(w, Math.round(h * r)));
    H = Math.min(MAX_CANVAS_SIDE, Math.max(h, Math.round(w / r)));
  }
  const left = Math.floor((W - src.width) / 2);
  const top = Math.floor((H - src.height) / 2);
  const data = Buffer.alloc(W * H * 4); // transparent black
  const mask = Buffer.alloc(W * H, 255);
  for (let y = 0; y < src.height; y++) {
    src.data.copy(data, ((top + y) * W + left) * 4, y * src.width * 4, (y + 1) * src.width * 4);
    mask.fill(0, (top + y) * W + left, (top + y) * W + left + src.width);
  }
  return { canvas: { width: W, height: H, data }, mask: { width: W, height: H, data: mask }, left, top };
}

function assertSameSize(a: { width: number; height: number }, b: { width: number; height: number }) {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`);
}
