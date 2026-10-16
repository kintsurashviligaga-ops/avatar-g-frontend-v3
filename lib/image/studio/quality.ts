import sharp from 'sharp';
import { sha256 } from './prompt';
import { ImageError } from './errors';
import type { ImageRequest, PreparedReference, ImageReference } from './contracts';

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_REFERENCE_BYTES_TOTAL = 12 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
const MIME: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

export async function decodeImage(bytes: Buffer, mime: string, output = false) {
  const code = output ? 'qc_failed' : 'invalid_reference';
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ImageError(code, 'Image exceeds the byte limit or is empty.');
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning', animated: true });
    const metadata = await image.metadata();
    if (!metadata.format || MIME[metadata.format] !== mime || (metadata.pages ?? 1) !== 1) {
      throw new ImageError(code, 'Use a single PNG, JPEG or WebP image with a matching MIME type.');
    }
    const { data, info } = await image.rotate().png().toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height || data.length > MAX_IMAGE_BYTES) throw new ImageError(code, 'The decoded image is too large.');
    return { data, width: info.width, height: info.height, mime: 'image/png' as const, bytes: data.length, digest: sha256(data) };
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw new ImageError(code, 'The image could not be fully decoded within the image limits.');
  }
}
export async function prepareReference(ref: ImageReference, bytes: Buffer, mime: string): Promise<PreparedReference> {
  return { id: ref.id, role: ref.role, ...await decodeImage(bytes, mime) };
}
export async function qualityCheck(bytes: Buffer, mime: string, request: ImageRequest) {
  const image = await decodeImage(bytes, mime, true);
  const [w, h] = request.aspectRatio.split(':').map(Number) as [number, number];
  if (Math.abs(image.width / image.height - w / h) / (w / h) > 0.025) {
    throw new ImageError('qc_failed', 'The generated aspect ratio differs from the approved request.');
  }
  // Google's sizes vary by aspect. Pixel area avoids falsely expecting a 16:9 1K image to have a 1024px short side.
  const scale = request.resolution === '4K' ? 4 : request.resolution === '2K' ? 2 : 1;
  const area = image.width * image.height;
  if (area < 700_000 * scale * scale || area > 1_700_000 * scale * scale) {
    throw new ImageError('qc_failed', 'The generated resolution differs from the approved request.');
  }
  return image;
}
