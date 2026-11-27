/**
 * lib/video/directorsWorkflow/cut.server.ts — run the final cut: download the delivered clips (and the bed), probe
 * them, join them with the long-form stitch plan (lib/video/longform/stitch), host the film for a week.
 *
 * Every input is DOWNLOADED FIRST through lib/web/publicFetch (public hosts only, a byte cap, media types only) and
 * ffmpeg reads only local files: the concat demuxer never opens a URL itself. Never throws; every miss is a reason.
 * The network, ffmpeg and storage are injected, so the order and the refusals are tested without any of them.
 */
import 'server-only';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { buildProbeArgs, buildStitchPlan, DEFAULT_MAX_UPLOAD_BYTES, parseProbe, type StitchClip } from '@/lib/video/longform/stitch';
import { fetchPublicToFile, MEDIA_TYPES } from '@/lib/web/publicFetch';
import { cutTarget } from './finalCut';
import type { DwProject } from './types';

const BUCKET = 'renders';
const WEEK_SEC = 604_800;
const CLIP_MAX_BYTES = 80 * 1024 * 1024;

type Exec = (bin: string, args: string[], opts: { timeout: number }) => Promise<{ stdout: string; stderr: string }>;

export interface CutDeps {
  bin: string | null;
  download: (url: string, path: string) => Promise<boolean>;
  exec: Exec;
  upload: (path: string, bytes: Buffer) => Promise<string | null>;
  readFile: (path: string) => Promise<Buffer>;
  size: (path: string) => Promise<number>;
  writeFile: (path: string, content: string) => Promise<void>;
  tmp: () => Promise<string>;
  cleanup: (dir: string) => Promise<void>;
}

const pexec = promisify(execFile) as unknown as Exec;

export const liveCutDeps = (): CutDeps => ({
  bin: (ffmpegStatic as unknown as string | null) ?? null,
  download: async (url, path) => (await fetchPublicToFile(url, path, { maxBytes: CLIP_MAX_BYTES, accept: MEDIA_TYPES, timeoutMs: 60_000 })).ok,
  exec: (bin, args, opts) => pexec(bin, args, { ...opts, killSignal: 'SIGKILL', maxBuffer: 1 << 26 } as never),
  upload: (path, bytes) => uploadBufferAndSign(BUCKET, path, bytes, 'video/mp4', WEEK_SEC),
  readFile: (p) => readFile(p),
  size: async (p) => (await stat(p)).size,
  writeFile: (p, c) => writeFile(p, c, 'utf8'),
  tmp: () => mkdtemp(join(tmpdir(), 'dw-cut-')),
  cleanup: (d) => rm(d, { recursive: true, force: true }),
});

export type CutResult =
  | { ok: true; url: string; path: string; bytes: number; seconds: number; mode: 'copy' | 'reencode' }
  | { ok: false; reason: string };

/** `ffmpeg -i` with no output exits non-zero and prints the streams on stderr. */
async function probe(deps: CutDeps, bin: string, file: string) {
  try {
    await deps.exec(bin, buildProbeArgs(file), { timeout: 20_000 });
    return null;
  } catch (e) {
    const stderr = String((e as { stderr?: string } | null)?.stderr ?? '');
    return stderr ? parseProbe(stderr) : null;
  }
}

export async function makeFinalCut(input: {
  project: DwProject;
  urls: readonly string[];
  music?: { url: string; durationSec: number | null } | null;
  budgetMs: number;
  maxUploadBytes?: number;
}, deps: CutDeps = liveCutDeps()): Promise<CutResult> {
  if (!deps.bin) return { ok: false, reason: 'ffmpeg_missing' };
  const bin = deps.bin;
  const dir = await deps.tmp();
  try {
    const clips: StitchClip[] = [];
    for (const [i, url] of input.urls.entries()) {
      const file = join(dir, `scene-${String(i + 1).padStart(2, '0')}.mp4`);
      if (!(await deps.download(url, file))) return { ok: false, reason: `clip_${i + 1}_unavailable` };
      const p = await probe(deps, bin, file);
      const fallbackSec = [...input.project.scenes].sort((a, b) => a.order - b.order)[i]?.seconds ?? 8;
      clips.push({ source: file, durationSec: p?.durationSec ?? fallbackSec, bytes: await deps.size(file).catch(() => null), probe: p });
    }
    let music: { source: string; durationSec: number | null } | null = null;
    if (input.music) {
      const file = join(dir, 'bed.audio');
      if (!(await deps.download(input.music.url, file))) return { ok: false, reason: 'music_unavailable' };
      music = { source: file, durationSec: input.music.durationSec };
    }
    const maxUploadBytes = input.maxUploadBytes ?? (Number(process.env.LONGFORM_MAX_UPLOAD_BYTES) || DEFAULT_MAX_UPLOAD_BYTES);
    const planned = buildStitchPlan({
      clips, workDir: dir, outName: 'film.mp4', music, maxUploadBytes, resumableUploadAvailable: false, target: cutTarget(input.project),
    });
    if (!planned.ok) return { ok: false, reason: planned.reason };
    const plan = planned.plan;
    if (plan.concatList) await deps.writeFile(plan.concatList.path, plan.concatList.content);
    await deps.exec(bin, plan.argv, { timeout: Math.max(30_000, input.budgetMs - 15_000) });
    const bytes = await deps.size(plan.outPath);
    if (bytes > maxUploadBytes) return { ok: false, reason: 'too_large' };
    const path = `director/${input.project.id.replace(/[^A-Za-z0-9_-]/g, '_')}/film-v${input.project.version}-${Date.now()}.mp4`;
    const url = await deps.upload(path, await deps.readFile(plan.outPath));
    if (!url) return { ok: false, reason: 'upload_failed' };
    return { ok: true, url, path, bytes, seconds: plan.totalDurationSec, mode: plan.mode };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.slice(0, 200) : 'cut_failed' };
  } finally {
    await deps.cleanup(dir).catch(() => undefined);
  }
}
