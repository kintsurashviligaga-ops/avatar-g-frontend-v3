/**
 * lib/image/artDirector/download.ts — one Art Director picture as a PNG or a JPG file, and its recipe (Phase 8.4 PR C).
 * Server only (sharp). The storage reads are injected so the owner rule and the conversion are tested without Supabase.
 *
 * Only `art-director/<uid>/<uuid>.png` of the CALLER is read (artResultId); the JPG is made here from that PNG
 * (white behind any transparency, quality 92), so no second copy is stored.
 */
import 'server-only';
import sharp from 'sharp';
import { ArtError } from './errors';
import { artResultId, downloadName, isArtLibraryMeta, type ArtLibraryMeta } from './library';
import type { ArtSize } from './spec';

export interface ArtFileDeps {
  /** The stored object's bytes, or null when it is not there. */
  read(path: string): Promise<Buffer | null>;
}

export type ArtFormat = 'png' | 'jpg';
export const JPG_QUALITY = 92;

const sidecarOf = (path: string) => path.replace(/\.png$/i, '.json');

/** The stored recipe of one of the caller's pictures, or null when it has none (or it is not a recipe). */
export async function readArtRecipe(deps: ArtFileDeps, path: string, userId: string): Promise<ArtLibraryMeta | null> {
  if (!artResultId(path, userId)) throw new ArtError('not_found', 'That picture was not found.', 404);
  const raw = await deps.read(sidecarOf(path)).catch(() => null);
  if (!raw) return null;
  try {
    const meta: unknown = JSON.parse(raw.toString('utf8'));
    return isArtLibraryMeta(meta) ? meta : null;
  } catch {
    return null;
  }
}

/** The size label for a file name when the recipe is missing: from the long side of the picture. */
export function sizeOfPixels(width: number, height: number): ArtSize {
  const side = Math.max(width, height);
  return side >= 3000 ? '4K' : side >= 1800 ? '2K' : '1K';
}

export async function artDownload(deps: ArtFileDeps, path: string, userId: string, format: ArtFormat): Promise<{ bytes: Buffer; contentType: string; filename: string }> {
  const id = artResultId(path, userId);
  if (!id) throw new ArtError('not_found', 'That picture was not found.', 404);
  const png = await deps.read(path).catch(() => null);
  if (!png) throw new ArtError('not_found', 'That picture was not found.', 404);
  const meta = await readArtRecipe(deps, path, userId);
  let size: ArtSize = meta?.size as ArtSize;
  if (!meta) {
    const info = await sharp(png).metadata().catch(() => null);
    size = sizeOfPixels(info?.width ?? 0, info?.height ?? 0);
  }
  const filename = downloadName(id, size, format);
  if (format === 'png') return { bytes: png, contentType: 'image/png', filename };
  const jpg = await sharp(png).flatten({ background: '#ffffff' }).jpeg({ quality: JPG_QUALITY, mozjpeg: true }).toBuffer();
  return { bytes: jpg, contentType: 'image/jpeg', filename };
}
