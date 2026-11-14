/** @jest-environment node */
/**
 * cut.server.ts — the final cut with every side effect faked: each clip is DOWNLOADED to a local file before ffmpeg runs
 * (ffmpeg never sees a URL), matching clips are stream-copied, mismatched ones re-encoded to the film's frame, the bed is
 * mixed in, and every miss is a reason (never a throw) with the work dir always cleaned up.
 */
jest.mock('server-only', () => ({}));
jest.mock('ffmpeg-static', () => '/usr/bin/ffmpeg');
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn() }));
jest.mock('../../web/publicFetch', () => ({ fetchPublicToFile: jest.fn(), MEDIA_TYPES: [] }));

import { emptyScene, type DwProject } from './index';
import { makeFinalCut, type CutDeps } from './cut.server';

const stderr = (w: number, h: number) => `  Duration: 00:00:08.00, start: 0.000000, bitrate: 6000 kb/s
  Stream #0:0(und): Video: h264 (High), yuv420p(tv, bt709, progressive), ${w}x${h}, 5800 kb/s, 24 fps, 24 tbr
  Stream #0:1(und): Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s
At least one output file must be specified`;

const board = (): DwProject => ({
  id: 'dw_1', title: 'Café', logline: 'x', aspect: '16:9', resolution: '720p', characters: [],
  scenes: [{ ...emptyScene('s1'), order: 1, seconds: 8 }, { ...emptyScene('s2'), order: 2, seconds: 8 }],
  status: 'approved', version: 4,
});

function fakeDeps(opts: { sizes?: [number, number][]; failDownload?: string; upload?: string | null; outBytes?: number } = {}) {
  const sizes = opts.sizes ?? [[1280, 720], [1280, 720]];
  const calls: string[] = [];
  const files: Record<string, string> = {};
  const deps: CutDeps = {
    bin: '/usr/bin/ffmpeg',
    download: jest.fn(async (url: string, path: string) => { calls.push(`download ${url} -> ${path}`); return url !== opts.failDownload; }),
    exec: jest.fn(async (_bin: string, args: string[]) => {
      if (args.length === 2 || (args.includes('-i') && !args.some((a) => a.endsWith('film.mp4')))) {
        const file = args[args.indexOf('-i') + 1]!;
        const i = Number(/scene-(\d+)/.exec(file)?.[1] ?? 1) - 1;
        calls.push(`probe ${file}`);
        const [w, h] = sizes[i] ?? [1280, 720];
        throw Object.assign(new Error('no output'), { stderr: stderr(w, h) });
      }
      calls.push(`ffmpeg ${args.join(' ')}`);
      return { stdout: '', stderr: '' };
    }),
    upload: jest.fn(async (path: string) => { calls.push(`upload ${path}`); return opts.upload === undefined ? `https://own.supabase.co/sign/${path}` : opts.upload; }),
    readFile: jest.fn(async () => Buffer.from('film')),
    size: jest.fn(async (p: string) => (p.endsWith('film.mp4') ? opts.outBytes ?? 9_000_000 : 4_000_000)),
    writeFile: jest.fn(async (p: string, c: string) => { files[p] = c; }),
    tmp: jest.fn(async () => '/tmp/dw-cut-x'),
    cleanup: jest.fn(async () => undefined),
  };
  return { deps, calls, files };
}

const URLS = ['https://own.supabase.co/a.mp4', 'https://own.supabase.co/b.mp4'];

it('downloads every clip first, then stream-copies matching clips from LOCAL files only', async () => {
  const { deps, calls, files } = fakeDeps();
  const r = await makeFinalCut({ project: board(), urls: URLS, budgetMs: 270_000 }, deps);
  expect(r).toMatchObject({ ok: true, mode: 'copy', seconds: 16, bytes: 9_000_000 });
  expect(calls[0]).toBe('download https://own.supabase.co/a.mp4 -> /tmp/dw-cut-x/scene-01.mp4');
  const ff = calls.find((c) => c.startsWith('ffmpeg'))!;
  expect(ff).not.toContain('https://');
  expect(ff).not.toContain('protocol_whitelist');
  expect(Object.values(files)[0]).toContain("/tmp/dw-cut-x/scene-01.mp4");
  expect(Object.values(files)[0]).not.toContain('https://');
  expect(calls.at(-1)).toMatch(/^upload director\/dw_1\/film-v4-\d+\.mp4$/);
  expect(deps.cleanup).toHaveBeenCalledWith('/tmp/dw-cut-x');
});

it('re-encodes mismatched clips to the film frame', async () => {
  const { deps, calls } = fakeDeps({ sizes: [[1280, 720], [1920, 1080]] });
  const r = await makeFinalCut({ project: board(), urls: URLS, budgetMs: 270_000 }, deps);
  expect(r).toMatchObject({ ok: true, mode: 'reencode' });
  expect(calls.find((c) => c.startsWith('ffmpeg'))).toContain('scale=1280:720');
});

it('mixes the downloaded bed under the dialogue', async () => {
  const { deps, calls } = fakeDeps();
  const r = await makeFinalCut({ project: board(), urls: URLS, music: { url: 'https://own.supabase.co/bed.mp3', durationSec: 30 }, budgetMs: 270_000 }, deps);
  expect(r.ok).toBe(true);
  expect(calls).toContain('download https://own.supabase.co/bed.mp3 -> /tmp/dw-cut-x/bed.audio');
  const ff = calls.find((c) => c.startsWith('ffmpeg'))!;
  expect(ff).toContain('/tmp/dw-cut-x/bed.audio');
  expect(ff).toContain('amix');
});

it('a clip that does not download stops the cut before ffmpeg runs', async () => {
  const { deps, calls } = fakeDeps({ failDownload: URLS[1] });
  expect(await makeFinalCut({ project: board(), urls: URLS, budgetMs: 270_000 }, deps)).toEqual({ ok: false, reason: 'clip_2_unavailable' });
  expect(calls.some((c) => c.startsWith('ffmpeg'))).toBe(false);
  expect(deps.cleanup).toHaveBeenCalled();
});

it('a bed that does not download, a film too large and a failed upload are reasons, not throws', async () => {
  const bed = fakeDeps({ failDownload: 'https://own.supabase.co/bed.mp3' });
  expect(await makeFinalCut({ project: board(), urls: URLS, music: { url: 'https://own.supabase.co/bed.mp3', durationSec: 30 }, budgetMs: 1 }, bed.deps))
    .toEqual({ ok: false, reason: 'music_unavailable' });
  const big = fakeDeps({ outBytes: 999_000_000 });
  expect(await makeFinalCut({ project: board(), urls: URLS, budgetMs: 1, maxUploadBytes: 50_000_000 }, big.deps)).toEqual({ ok: false, reason: 'too_large' });
  expect(big.deps.upload).not.toHaveBeenCalled();
  const up = fakeDeps({ upload: null });
  expect(await makeFinalCut({ project: board(), urls: URLS, budgetMs: 1 }, up.deps)).toEqual({ ok: false, reason: 'upload_failed' });
});

it('no ffmpeg binary → ffmpeg_missing; an ffmpeg crash → its message', async () => {
  const none = fakeDeps();
  expect(await makeFinalCut({ project: board(), urls: URLS, budgetMs: 1 }, { ...none.deps, bin: null })).toEqual({ ok: false, reason: 'ffmpeg_missing' });
  const crash = fakeDeps();
  const exec = crash.deps.exec as jest.Mock;
  const probeImpl = exec.getMockImplementation()!;
  exec.mockImplementation(async (bin: string, args: string[], o: { timeout: number }) => {
    if (args.some((a) => a.endsWith('film.mp4'))) throw new Error('ffmpeg exited 1');
    return probeImpl(bin, args, o);
  });
  expect(await makeFinalCut({ project: board(), urls: URLS, budgetMs: 1 }, crash.deps)).toEqual({ ok: false, reason: 'ffmpeg exited 1' });
  expect(crash.deps.cleanup).toHaveBeenCalled();
});
