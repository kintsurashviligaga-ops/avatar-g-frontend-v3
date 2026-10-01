/**
 * Decode → measure → thumbnail, and decode → grade → encode — the two jobs the culling workspace runs on a photo.
 * Shared, line for line, by the worker (./cull.worker.ts, OffscreenCanvas) and its main-thread fallback (a DOM
 * canvas), so a browser without OffscreenCanvas gets the same numbers, only slower.
 *
 * Everything here runs on the user's device. There is no fetch, no upload and no storage in this file — the
 * „photos never leave your device" line on the tool (lib/studio/tools.ts) depends on it staying that way.
 */
import { ANALYSIS_LONG_EDGE, analyzePixels, fitWithin, type PhotoMetrics } from '@/lib/photo/cullMetrics';
import { EXIF_SCAN_BYTES, readExifCaptureTime } from '@/lib/photo/exif';
import { applyGrade, type Grade } from '@/lib/photo/grade';

/** The grid's thumbnails: two device pixels per CSS pixel of the widest cell. */
export const THUMB_LONG_EDGE = 400;
/**
 * ⚠️ iOS SAFARI GIVES UP ON A CANVAS ABOVE 16 777 216 PIXELS — getContext returns null (or every draw is dropped)
 * instead of throwing. A graded export first tries EXPORT_MAX_PIXELS and, when the canvas refuses, retries at the
 * iOS ceiling; the copy is then scaled down, which the workspace tells the user.
 */
export const EXPORT_MAX_PIXELS = 50_000_000;
export const IOS_CANVAS_MAX_PIXELS = 16_777_216;
/** Rows graded per getImageData/putImageData pass: a 24 MP frame never needs a second full-size pixel buffer. */
const GRADE_STRIP_ROWS = 512;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type CanvasFactory = (w: number, h: number) => { canvas: AnyCanvas; ctx: Ctx2D };

export interface AnalyzeResult {
  metrics: PhotoMetrics;
  /** Capture time from EXIF (ms), or null. */
  takenAt: number | null;
  /** The ORIGINAL's pixel size. */
  width: number;
  height: number;
  thumb: Blob;
}

export interface RenderResult {
  blob: Blob;
  /** True when the copy had to be scaled down to fit the browser's canvas limit. */
  downscaled: boolean;
}

const contextOf = (canvas: AnyCanvas): Ctx2D | null =>
  (canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null);

/** A canvas factory on OffscreenCanvas — the worker's, and the main thread's when the browser has it. */
export const offscreenCanvas: CanvasFactory = (w, h) => {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = contextOf(canvas);
  if (!ctx) throw new Error('canvas-unavailable');
  return { canvas, ctx };
};

/** A canvas factory on a detached <canvas> — the fallback when OffscreenCanvas is missing. Main thread only. */
export const domCanvas: CanvasFactory = (w, h) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = contextOf(canvas);
  if (!ctx) throw new Error('canvas-unavailable');
  return { canvas, ctx };
};

interface Decoded { source: CanvasImageSource; width: number; height: number; close: () => void }

/**
 * Decodes a photo, upright (EXIF orientation applied). createImageBitmap where it exists — off the main thread's
 * critical path and available in workers — else an <img> (main thread only).
 */
export async function decodePhoto(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      // An older engine that only knows 'none' / 'flipY' rejects the option itself; decoding without it is upright
      // there anyway. A real decode failure fails again below and propagates.
      if ((e as Error)?.name !== 'TypeError') throw e;
      bmp = await createImageBitmap(file);
    }
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('decode-unavailable');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => { img.src = ''; } };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function encode(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode-failed'))), type, quality);
  });
}

function drawScaled(make: CanvasFactory, src: Decoded | { source: CanvasImageSource; width: number; height: number }, w: number, h: number) {
  const { canvas, ctx } = make(w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src.source, 0, 0, src.width, src.height, 0, 0, w, h);
  return { canvas, ctx };
}

/** Measures one photo and makes its grid thumbnail. */
export async function analyzePhoto(file: File, make: CanvasFactory): Promise<AnalyzeResult> {
  let takenAt: number | null = null;
  try { takenAt = readExifCaptureTime(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer()); } catch { /* no date */ }
  const d = await decodePhoto(file);
  try {
    if (!d.width || !d.height) throw new Error('empty-image');
    const a = fitWithin(d.width, d.height, ANALYSIS_LONG_EDGE);
    const { canvas, ctx } = drawScaled(make, d, a.w, a.h);
    const px = ctx.getImageData(0, 0, a.w, a.h);
    const metrics = analyzePixels(px.data, a.w, a.h);
    // The thumbnail comes from the analysis copy, not the original: a second full-size scale is the slow part.
    const t = fitWithin(a.w, a.h, THUMB_LONG_EDGE);
    const thumbCanvas = drawScaled(make, { source: canvas, width: a.w, height: a.h }, t.w, t.h).canvas;
    const thumb = await encode(thumbCanvas, 'image/jpeg', 0.82);
    return { metrics, takenAt, width: d.width, height: d.height, thumb };
  } finally {
    d.close();
  }
}

/** The pixels of a photo at most `longEdge` across — the grade panel's live preview source. */
export async function previewPixels(file: File, longEdge: number, make: CanvasFactory): Promise<ImageData> {
  const d = await decodePhoto(file);
  try {
    const s = fitWithin(d.width, d.height, longEdge);
    return drawScaled(make, d, s.w, s.h).ctx.getImageData(0, 0, s.w, s.h);
  } finally {
    d.close();
  }
}

function gradeCanvas(ctx: Ctx2D, w: number, h: number, grade: Grade) {
  for (let y = 0; y < h; y += GRADE_STRIP_ROWS) {
    const rows = Math.min(GRADE_STRIP_ROWS, h - y);
    const strip = ctx.getImageData(0, y, w, rows);
    applyGrade(strip.data, grade, strip.data);
    ctx.putImageData(strip, 0, y);
  }
}

/** The graded copy of a photo, encoded as `type` (JPEG or PNG) at full size where the browser allows it. */
export async function renderGraded(file: File, grade: Grade, type: 'image/jpeg' | 'image/png', make: CanvasFactory): Promise<RenderResult> {
  const d = await decodePhoto(file);
  try {
    let lastError: unknown = null;
    for (const cap of [EXPORT_MAX_PIXELS, IOS_CANVAS_MAX_PIXELS]) {
      const scale = Math.min(1, Math.sqrt(cap / (d.width * d.height)));
      const w = Math.max(1, Math.floor(d.width * scale));
      const h = Math.max(1, Math.floor(d.height * scale));
      try {
        const { canvas, ctx } = drawScaled(make, d, w, h);
        gradeCanvas(ctx, w, h, grade);
        const blob = await encode(canvas, type, 0.92);
        if (!blob.size) throw new Error('encode-failed');
        return { blob, downscaled: scale < 1 };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('render-failed');
  } finally {
    d.close();
  }
}
