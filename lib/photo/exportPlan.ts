/**
 * What „Export picks" does with the picks, decided before a byte is read: which files go into which ZIP, which are
 * saved one by one, and what every entry is called. Pure, so the size cap and the naming are tested without a
 * browser. The export itself runs on the device (components/studio/photo/exportPicks.ts) — nothing is uploaded.
 */

/** The photo formats the workspace takes: what every browser decodes, on every platform. RAW and HEIC are not. */
export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;

/** One session's ceiling — 1 000 thumbnails and their metrics stay comfortably inside a phone's memory. */
export const MAX_PHOTOS = 1000;
/** A single file over this is skipped: a decoded 200 MB PNG is beyond what a tab can hold for a culling pass. */
export const MAX_PHOTO_BYTES = 200 * 1024 * 1024;

/**
 * ⚠️ THE ZIP IS BUILT IN MEMORY. JSZip holds every entry and then the finished archive, so a 4 GB pick set in one ZIP
 * kills the tab (roughly twice the archive's size at the peak). Picks are therefore split into parts of at most this
 * many bytes, and a single file bigger than a part is saved on its own.
 */
export const ZIP_PART_CAP_BYTES = 300 * 1024 * 1024;

/** True for a JPEG, PNG or WebP — by MIME type, or by extension when the browser reports none (some drag sources). */
export function isAcceptedPhoto(file: { type: string; name: string }): boolean {
  if (file.type) return (ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type.toLowerCase());
  return ACCEPTED_EXT.test(file.name);
}

export interface ExportPlan<T> {
  /** Each inner list is one ZIP, in pick order. */
  zips: T[][];
  /** Files too large for any part — saved one by one. */
  singles: T[];
}

/** Greedy, order-preserving split of `items` into ZIP parts of at most `cap` bytes each. */
export function planExport<T extends { size: number }>(items: readonly T[], cap: number = ZIP_PART_CAP_BYTES): ExportPlan<T> {
  const zips: T[][] = [];
  const singles: T[] = [];
  let part: T[] = [];
  let bytes = 0;
  for (const it of items) {
    const size = Number.isFinite(it.size) && it.size > 0 ? it.size : 0;
    if (size > cap) { singles.push(it); continue; }
    if (part.length && bytes + size > cap) { zips.push(part); part = []; bytes = 0; }
    part.push(it);
    bytes += size;
  }
  if (part.length) zips.push(part);
  return { zips, singles };
}

/** A file name safe as a ZIP entry and as a download: no folders, no control characters, never empty. */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = name.replace(/[\u0000-\u001f\u007f]/g, '').split(/[\\/]/).pop()!.replace(/^\.+/, '').trim();
  return (base || 'photo').slice(0, 180);
}

/** Two cards both have an IMG_0001.JPG: the second becomes „IMG_0001 (2).JPG" (case-insensitive, like most disks). */
export function uniqueNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((raw) => {
    const name = safeFileName(raw);
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let k = 2; taken.has(candidate.toLowerCase()); k++) candidate = `${stem} (${k})${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

/** The output type of a graded copy: a PNG stays a PNG (it may carry transparency), everything else is a JPEG. */
export function gradedMime(sourceType: string): 'image/png' | 'image/jpeg' {
  return sourceType.toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
}

/** „IMG_0001.webp" graded → „IMG_0001.jpg"; the extension follows the type the copy is actually encoded in. */
export function gradedFileName(name: string, sourceType: string): string {
  const safe = safeFileName(name);
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  return `${stem}${gradedMime(sourceType) === 'image/png' ? '.png' : '.jpg'}`;
}

/** „myavatar-picks-20261001-1430.zip", or „…-part2of3.zip" when the picks were split. */
export function zipFileName(at: Date, part = 1, parts = 1): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `myavatar-picks-${stamp}${parts > 1 ? `-part${part}of${parts}` : ''}.zip`;
}
