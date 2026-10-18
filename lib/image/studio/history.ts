import { IMAGE_KIND, parseImagePlan, type ImageRequest, type SavedImage } from './contracts';
import type { LeaseRow } from '@/lib/orchestrator/jobLease';
import { ImageError } from './errors';

export interface ImageHistoryIO {
  read(id: string, userId: string): Promise<LeaseRow | null>;
  children(id: string, userId: string, limit: number): Promise<LeaseRow[]>;
  resign(image: SavedImage, userId: string): Promise<SavedImage>;
}
const owned = (row: LeaseRow | null, userId: string): row is LeaseRow =>
  !!row && row.userId === userId && row.exec?.kind === IMAGE_KIND;
export function versionOf(row: LeaseRow) {
  const plan = parseImagePlan(row.params._job);
  return { id: row.id, parentJobId: plan.request.parentJobId ?? null, status: row.status,
    operation: plan.request.operation, prompt: plan.request.originalPrompt };
}
export async function readImageAsset(io: ImageHistoryIO, userId: string, id: string) {
  const row = await io.read(id, userId);
  if (!owned(row, userId) || row.status !== 'completed') throw new ImageError('not_found', 'Image version not found.', 404);
  const request: ImageRequest = parseImagePlan(row.params._job).request;
  const saved = (row.params._image as { saved?: SavedImage } | undefined)?.saved;
  if (!saved) throw new ImageError('storage_error', 'The image version has no stored output.', 503);
  return { ...versionOf(row), request, image: await io.resign(saved, userId), qc: row.result?.qc ?? null };
}
/** Bounded parent chain and direct children. Select a child to explore its branches; never scan the entire Library. */
export async function imageVersions(io: ImageHistoryIO, userId: string, id: string) {
  const start = await io.read(id, userId);
  if (!owned(start, userId)) throw new ImageError('not_found', 'Image version not found.', 404);
  const ancestors = [], seen = new Set([id]);
  let parent = versionOf(start).parentJobId;
  for (let n = 0; parent && n < 20; n++) {
    if (seen.has(parent)) throw new ImageError('validation_failed', 'The version chain is inconsistent.', 409);
    seen.add(parent);
    const row = await io.read(parent, userId);
    if (!owned(row, userId)) break; // A removed source is a broken link, never permission to read another owner.
    ancestors.push(versionOf(row));
    parent = versionOf(row).parentJobId;
  }
  const rows = (await io.children(id, userId, 31)).filter(r => owned(r, userId) && versionOf(r).parentJobId === id);
  return { current: versionOf(start), ancestors, children: rows.slice(0, 30).map(versionOf),
    moreAncestors: !!parent, moreChildren: rows.length > 30 };
}
