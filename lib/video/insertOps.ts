/**
 * lib/video/insertOps.ts — runs ./../services/montage/insertCompose on a master: the cutaways in a split screen, the
 * master's sound copied. Server-only (ffmpeg, storage). Returns the hosted result, or null with the reason logged.
 */
import 'server-only';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { ffmpegExec } from '@/lib/video/ffmpegExec';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { buildInsertArgs } from '@/lib/services/montage/insertCompose';
import type { PlannedInsert } from '@/lib/services/montage/insertPlan';

const BIN = ffmpegStatic as unknown as string | null;

export async function overlayInserts(
  masterUrl: string,
  inserts: ReadonlyArray<{ url: string; startSec: number; endSec: number; clipStartSec: number }>,
  dims: { w: number; h: number },
): Promise<string | null> {
  if (!BIN || !masterUrl || !inserts.length) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'montage-inserts-'));
    const out = join(dir, 'out.mp4');
    const planned: PlannedInsert[] = inserts.map((x, k) => ({ ...x, clip: k, line: k, text: '' }));
    const args = buildInsertArgs(masterUrl, inserts.map((x) => x.url), planned, out, dims);
    await ffmpegExec(BIN, args, { maxBuffer: 1 << 26, timeout: 300_000 });
    const buf = await readFile(out);
    if (buf.byteLength < 1_024) return null;
    return (await uploadBufferAndSign('renders', `montage/inserts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`, buf, 'video/mp4', 604_800)) ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[montage.inserts] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
