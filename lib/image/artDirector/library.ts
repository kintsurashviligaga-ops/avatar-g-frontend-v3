/**
 * lib/image/artDirector/library.ts — what an Art Director image saves with (Library card + "remix this"). Pure.
 * Everything needed to understand and re-run the picture: prompt, the final prompt sent, model, style, ratio, size, seed
 * (best effort), references by letter and role, the parent image, the price and the mask digest proof.
 */
import { ART_MODEL, type ArtRatio, type ArtSize } from './spec';
import { refLetter, type ArtOperation } from './prompt';
import type { ArtRole } from './spec';

export interface ArtLibraryMeta {
  kind: 'image';
  subtype: 'art-director-v1';
  model: typeof ART_MODEL;
  operation: ArtOperation;
  prompt: string;
  finalPrompt: string;
  styleId: string | null;
  avoid: string[];
  aspectRatio: ArtRatio;
  size: ArtSize;
  seed: number | null;
  seedBestEffort: true;
  references: Array<{ letter: string; role: ArtRole; path: string; locked: boolean }>;
  parentId: string | null;
  gridId: string | null;
  gridIndex: number | null;
  credits: number;
  width: number;
  height: number;
  /** mask_edit / extend with keepRest: sha256 of the pixels outside the mask (equal to the original's). */
  unmaskedDigest: string | null;
  createdAt: string;
}

export function artLibraryMeta(x: Omit<ArtLibraryMeta, 'kind' | 'subtype' | 'model' | 'seedBestEffort' | 'references' | 'createdAt'> & {
  references: Array<{ role: ArtRole; path: string; locked?: boolean }>;
  now: Date;
}): ArtLibraryMeta {
  const { now, references, ...rest } = x;
  return {
    kind: 'image', subtype: 'art-director-v1', model: ART_MODEL, seedBestEffort: true, ...rest,
    references: references.map((r, i) => ({ letter: refLetter(i), role: r.role, path: r.path, locked: !!r.locked })),
    createdAt: now.toISOString(),
  };
}

/** Download file name: myavatar-<id>-<size>.<ext>. */
export function downloadName(id: string, size: ArtSize, format: 'png' | 'jpg'): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'image';
  return `myavatar-${safe}-${size.toLowerCase()}.${format}`;
}
