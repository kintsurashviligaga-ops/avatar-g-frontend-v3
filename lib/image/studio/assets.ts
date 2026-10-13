import type { ImageReference } from './contracts';
import { ImageError } from './errors';
import { prepareReference, MAX_IMAGE_BYTES } from './quality';

/** Testable ownership boundary. Resolve must return only an authenticated owner's private object. */
export interface ImageAssetIO {
  ownedUpload(path: string, userId: string): Promise<string | null>;
  ownedResult(id: string, userId: string): Promise<string | null>;
  download(url: string, maxBytes: number): Promise<{ bytes: Buffer; mime: string }>;
}
export async function loadImageReference(io: ImageAssetIO, ref: ImageReference, userId: string) {
  const url = ref.asset.kind === 'upload' ? await io.ownedUpload(ref.asset.path, userId) : await io.ownedResult(ref.asset.id, userId);
  if (!url) throw new ImageError('not_found', 'The reference image was not found.', 404);
  const image = await io.download(url, MAX_IMAGE_BYTES);
  return prepareReference(ref, image.bytes, image.mime);
}
