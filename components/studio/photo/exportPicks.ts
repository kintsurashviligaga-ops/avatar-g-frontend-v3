/**
 * „Export picks" — on the device, from the files the user dropped. Ungraded picks go out byte for byte (EXIF and
 * all); graded ones are re-encoded through the worker. They are packed into ZIPs (JSZip, loaded only now) in parts
 * that stay under the in-memory cap (lib/photo/exportPlan.ts), and anything that cannot be zipped — a file bigger
 * than a part, or a ZIP the browser failed to build — is saved file by file instead. Nothing is uploaded.
 *
 * These are same-origin blob: links, so `<a download>` really downloads (the cross-origin trap ResultActions exists
 * for does not apply here).
 */
import { gradedFileName, gradedMime, planExport, uniqueNames, zipFileName } from '@/lib/photo/exportPlan';
import { isNeutralGrade } from '@/lib/photo/grade';
import type { CullClient } from './cullClient';
import type { PhotoItem } from './session';

export interface ExportProgress { done: number; total: number }

export interface ExportOutcome {
  /** ZIP archives saved. */
  zips: number;
  /** Files saved one by one (too big for a part, or their ZIP failed). */
  files: number;
  /** Graded picks that could not be re-encoded and were saved as shot. */
  ungraded: string[];
  /** Graded picks scaled down to fit the browser's canvas limit. */
  downscaled: number;
  /** A ZIP could not be built and its picks were saved one by one. */
  zipFailed: boolean;
}

/** Space between one-by-one downloads: browsers throttle a burst of them (and Chrome asks once to allow „multiple"). */
const PER_FILE_GAP_MS = 350;

export function saveBlob(blob: Blob, name: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked late: Safari starts reading the blob after click() returns.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function exportPicks(
  picks: readonly PhotoItem[],
  client: CullClient,
  opts: { onProgress?: (p: ExportProgress) => void; now?: Date; gapMs?: number; save?: (blob: Blob, name: string) => void } = {},
): Promise<ExportOutcome> {
  const save = opts.save ?? saveBlob;
  const gap = opts.gapMs ?? PER_FILE_GAP_MS;
  const now = opts.now ?? new Date();
  const outcome: ExportOutcome = { zips: 0, files: 0, ungraded: [], downscaled: 0, zipFailed: false };
  const names = uniqueNames(picks.map((p) => (isNeutralGrade(p.grade) ? p.name : gradedFileName(p.name, p.type))));
  const entries = picks.map((item, i) => ({ item, name: names[i]!, size: item.size }));
  const plan = planExport(entries);
  const total = entries.length;
  let done = 0;
  const tick = () => opts.onProgress?.({ done: ++done, total });

  type Entry = (typeof entries)[number];
  /** Bytes already produced for an entry — a ZIP that fails after grading half its part does not grade them twice. */
  const ready = new Map<Entry, { blob: Blob; name: string }>();

  /** The bytes that go out for one pick: the original file, or its graded copy (the original if grading fails). */
  const bytesOf = async (e: Entry): Promise<{ blob: Blob; name: string }> => {
    const had = ready.get(e);
    if (had) return had;
    let out: { blob: Blob; name: string };
    if (isNeutralGrade(e.item.grade)) out = { blob: e.item.file, name: e.name };
    else {
      try {
        const r = await client.render(e.item.file, e.item.grade, gradedMime(e.item.type));
        if (r.downscaled) outcome.downscaled++;
        out = { blob: r.blob, name: e.name };
      } catch {
        outcome.ungraded.push(e.item.name);
        // The pick still goes out — as shot, so its name takes the original's extension back.
        const dot = e.item.name.lastIndexOf('.');
        out = { blob: e.item.file, name: e.name.replace(/\.(jpg|png)$/i, '') + (dot > 0 ? e.item.name.slice(dot) : '') };
      }
    }
    ready.set(e, out);
    return out;
  };

  const saveOneByOne = async (list: readonly Entry[], counted: boolean) => {
    for (const e of list) {
      const { blob, name } = await bytesOf(e);
      save(blob, name);
      outcome.files++;
      if (!counted) tick();
      if (gap) await sleep(gap);
    }
  };

  const parts = plan.zips.length;
  for (let i = 0; i < parts; i++) {
    const part = plan.zips[i]!;
    let counted = 0;
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const e of part) {
        const { blob, name } = await bytesOf(e);
        // STORE: JPEG, PNG and WebP are already compressed — DEFLATE would burn seconds to save ~1 %.
        zip.file(name, blob, { binary: true, compression: 'STORE', date: new Date(e.item.file.lastModified || now.getTime()) });
        tick();
        counted++;
      }
      const archive = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
      save(archive, zipFileName(now, i + 1, parts));
      outcome.zips++;
    } catch {
      // ⚠️ THE PER-FILE FALLBACK. A failed import of the ZIP code, an out-of-memory archive, a quota — the picks
      // still reach the user, one download each, rather than the export dying with nothing saved.
      outcome.zipFailed = true;
      await saveOneByOne(part.slice(0, counted), true);
      await saveOneByOne(part.slice(counted), false);
    }
    for (const e of part) ready.delete(e); // let the part's graded copies go before the next part is built
  }
  await saveOneByOne(plan.singles, false);
  return outcome;
}
