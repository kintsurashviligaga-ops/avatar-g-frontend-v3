/** @jest-environment node */
/**
 * Smart Editor server jobs (Phase 8.7 PR B) with FAKE deps: no ffmpeg, no Chirp, no storage, no database.
 *
 *   runCaptions        pauses first, pieces ≤ 55 s, words back in SOURCE seconds, billed = audio actually sent
 *   renderSmartLayers  one ffmpeg pass: effects → caption frames (concat) → text cards; sound copied untouched
 *   coerceSmartLayers  a render request's `smart` field made safe
 *   smartOpenTo        MONTAGE_SMART_EDITOR off | admin | everyone
 *
 * SMART_FFMPEG_IT=1 also runs the last block with the REAL ffmpeg-static + resvg + FiraGO: a 3 s clip gets Georgian
 * captions, a title and a glitch, and the output is probed (local check; CI keeps it off for time).
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../admin/guard', () => ({ isAdminUserAsync: jest.fn(async (u: { id: string }) => u.id === 'admin') }));
jest.mock('../../../veo/vertexAuth', () => ({ getVertexAccessToken: jest.fn(), vertexAiConfig: jest.fn(() => null) }));
jest.mock('../../../security/callerMedia', () => ({ firstUnreadableOwnUrl: jest.fn(async () => -1), resolveCallerMedia: jest.fn() }));
jest.mock('../../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn() }));

/* eslint-disable import/first */
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { User } from '@supabase/supabase-js';
import { coerceSmartLayers, hasSmartLayers, liveSmartDeps, renderSmartLayers, runCaptions, smartOpenTo, type SmartDeps, type SmartLayers } from './server';
import { emptyTracks } from './timeline';
/* eslint-enable import/first */

const chirpAnswer = (words: Array<[string, number, number]>) => ({
  results: [{ alternatives: [{ transcript: words.map((w) => w[0]).join(' '), words: words.map(([word, s, e]) => ({ word, startOffset: `${s}s`, endOffset: `${e}s` })) }] }],
});

describe('runCaptions', () => {
  it('splits a long source at its pauses, sends each piece once and puts the words back in source seconds', async () => {
    const extracted: Array<[number, number]> = [];
    const deps: Pick<SmartDeps, 'ffmpegLog' | 'extractWav' | 'recognize'> = {
      // window 10..110 s; pause at 40.0–41.0 and 80.0–80.8 RELATIVE to the seek point (ffmpeg's log is relative)
      ffmpegLog: async () => 'silence_start: 40\nsilence_end: 41 | silence_duration: 1\nsilence_start: 80\nsilence_end: 80.8\n',
      extractWav: async (_u, a, b) => { extracted.push([a, b]); return new Uint8Array([1, 2, 3]); },
      recognize: async () => chirpAnswer([['გამარჯობა', 0.2, 0.8], ['ყველას', 0.9, 1.4]]),
    };
    const run = await runCaptions(deps, [{ sourceId: 's1', url: 'https://cdn.test/a.mp4', startSec: 10, endSec: 110 }], 'ka');
    expect(run.pieces).toBeGreaterThanOrEqual(2);
    expect(run.failedPieces).toBe(0);
    for (const [a, b] of extracted) {
      expect(b - a).toBeLessThanOrEqual(55.001);
      expect(a).toBeGreaterThanOrEqual(10);
      expect(b).toBeLessThanOrEqual(110);
    }
    // billed = exactly what was sent
    expect(run.billedSec).toBeCloseTo(extracted.reduce((s, [a, b]) => s + b - a, 0), 2);
    const words = run.wordsBySource.s1!;
    expect(words[0]).toEqual(expect.objectContaining({ text: 'გამარჯობა' }));
    expect(words[0]!.startSec).toBeCloseTo(extracted[0]![0] + 0.2, 2);
    // words never go backwards across pieces
    for (let i = 1; i < words.length; i += 1) expect(words[i]!.startSec).toBeGreaterThanOrEqual(words[i - 1]!.startSec);
  });

  it('a piece that fails is not billed, and is counted', async () => {
    let n = 0;
    const deps: Pick<SmartDeps, 'ffmpegLog' | 'extractWav' | 'recognize'> = {
      ffmpegLog: async () => '',
      extractWav: async () => { n += 1; if (n === 1) throw new Error('decode'); return new Uint8Array([1]); },
      recognize: async () => chirpAnswer([['hi', 0.1, 0.4]]),
    };
    const run = await runCaptions(deps, [
      { sourceId: 'a', url: 'https://cdn.test/a.mp4', startSec: 0, endSec: 12 },
      { sourceId: 'b', url: 'https://cdn.test/b.mp4', startSec: 0, endSec: 8 },
    ], 'en');
    expect(run.pieces).toBe(2);
    expect(run.failedPieces).toBe(1);
    expect(run.billedSec).toBeCloseTo(8, 3);
    expect(run.wordsBySource.a).toEqual([]);
    expect(run.wordsBySource.b).toHaveLength(1);
  });

  it('a silence probe that throws still captions the source (one window piece)', async () => {
    const deps: Pick<SmartDeps, 'ffmpegLog' | 'extractWav' | 'recognize'> = {
      ffmpegLog: async () => { throw new Error('probe'); },
      extractWav: async () => new Uint8Array([1]),
      recognize: async () => chirpAnswer([['ok', 0, 0.3]]),
    };
    const run = await runCaptions(deps, [{ sourceId: 'x', url: 'https://cdn.test/x.mp4', startSec: 2, endSec: 20 }], 'ru');
    expect(run.pieces).toBe(1);
    expect(run.wordsBySource.x![0]!.startSec).toBeCloseTo(2, 3);
  });
});

const layers = (over: Partial<SmartLayers> = {}): SmartLayers => ({
  tracks: {
    texts: [{ id: 't0', t0: 0.5, t1: 2, text: 'სათაური', pos: 'top', look: 'title' }],
    effects: [{ id: 'f0', t0: 1, t1: 1.3, kind: 'glitch', amount: 0.6 }],
  },
  captions: { words: [{ text: 'გამარჯობა', startSec: 0.2, endSec: 0.7 }, { text: 'ყველას', startSec: 0.8, endSec: 1.2 }], style: 'bold-word', pos: 'bottom' },
  ...over,
});

describe('renderSmartLayers (fake ffmpeg)', () => {
  it('builds ONE pass: effects, caption frames by concat, text cards between their times, audio copied', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'smart-test-'));
    let args: string[] = [];
    const deps: Pick<SmartDeps, 'rasterize' | 'ffmpegRun' | 'upload'> = {
      rasterize: jest.fn(async () => Buffer.from('png')),
      ffmpegRun: jest.fn(async (a: string[]) => { args = a; await writeFile(join(dir, 'out.mp4'), 'mp4'); }),
      upload: jest.fn(async () => 'https://cdn.test/smart.mp4'),
    };
    const url = await renderSmartLayers(deps, 'https://cdn.test/master.mp4', layers(), 1080, 1920, 3, dir);
    expect(url).toBe('https://cdn.test/smart.mp4');
    expect(deps.ffmpegRun).toHaveBeenCalledTimes(1);
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).toMatch(/rgbashift/);
    expect(graph).toMatch(/eof_action=pass/);
    expect(graph).toMatch(/between\(t\\,0\.5\\,2\)/);
    expect(args).toEqual(expect.arrayContaining(['-f', 'concat', '-c:a', 'copy', '-map', '0:a?']));
    const list = await readFile(join(dir, 'captions.ffconcat'), 'utf8');
    expect(list.startsWith('ffconcat version 1.0')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('a frame that cannot be drawn fails the layer (no half-captioned master)', async () => {
    const deps: Pick<SmartDeps, 'rasterize' | 'ffmpegRun' | 'upload'> = {
      rasterize: jest.fn(async () => null),
      ffmpegRun: jest.fn(),
      upload: jest.fn(),
    };
    expect(await renderSmartLayers(deps, 'https://cdn.test/m.mp4', layers(), 720, 1280, 3)).toBeNull();
    expect(deps.ffmpegRun).not.toHaveBeenCalled();
  });

  it('an ffmpeg failure is null, never a throw', async () => {
    const deps: Pick<SmartDeps, 'rasterize' | 'ffmpegRun' | 'upload'> = {
      rasterize: jest.fn(async () => Buffer.from('png')),
      ffmpegRun: jest.fn(async () => { throw new Error('boom'); }),
      upload: jest.fn(),
    };
    expect(await renderSmartLayers(deps, 'https://cdn.test/m.mp4', layers({ captions: null }), 720, 1280, 3)).toBeNull();
  });
});

describe('coerceSmartLayers', () => {
  it('clips words to the edit, sorts them, defaults the style and drops junk', () => {
    const l = coerceSmartLayers({
      captions: { style: 'nope', pos: 'side', words: [{ text: 'b', startSec: 2, endSec: 2.5 }, { text: 'a', startSec: 1, endSec: 1.4 }, { text: '', startSec: 0, endSec: 1 }, { text: 'late', startSec: 9, endSec: 10 }, { text: 'x', startSec: 3, endSec: 2 }] },
    }, 5)!;
    expect(l.captions!.words.map((w) => w.text)).toEqual(['a', 'b']);
    expect(l.captions!.style).toBe('standard');
    expect(l.captions!.pos).toBeUndefined();
  });
  it('takes the safe zone only from a known template', () => {
    expect(coerceSmartLayers({ template: 'tiktok', tracks: { effects: [{ kind: 'flash', t0: 0, t1: 0.3 }] } }, 5)!.safe).toBeDefined();
    expect(coerceSmartLayers({ template: 'hack', tracks: { effects: [{ kind: 'flash', t0: 0, t1: 0.3 }] } }, 5)!.safe).toBeUndefined();
  });
  it('nothing to lay → null, so the render skips the leg', () => {
    expect(coerceSmartLayers({ tracks: { texts: [], effects: [{ kind: 'explode', t0: 0, t1: 1 }] } }, 5)).toBeNull();
    expect(coerceSmartLayers('x', 5)).toBeNull();
    expect(hasSmartLayers({ tracks: emptyTracks() })).toBe(false);
  });
});

describe('smartOpenTo (MONTAGE_SMART_EDITOR)', () => {
  const admin = { id: 'admin' } as User;
  const member = { id: 'u1' } as User;
  it('off unless set; admin = admins only; everyone = every signed-in user', async () => {
    expect(await smartOpenTo(admin, {})).toBe(false);
    expect(await smartOpenTo(admin, { MONTAGE_SMART_EDITOR: 'true' })).toBe(false);
    expect(await smartOpenTo(admin, { MONTAGE_SMART_EDITOR: 'admin' })).toBe(true);
    expect(await smartOpenTo(member, { MONTAGE_SMART_EDITOR: 'admin' })).toBe(false);
    expect(await smartOpenTo(member, { MONTAGE_SMART_EDITOR: 'everyone' })).toBe(true);
    expect(await smartOpenTo(null, { MONTAGE_SMART_EDITOR: 'everyone' })).toBe(false);
  });
});

// ── REAL ffmpeg + resvg (local only) ─────────────────────────────────────────────────────────────────────────────
// ffmpeg-static's own binary when it was downloaded, else SMART_FFMPEG_BIN (e.g. /usr/bin/ffmpeg) for a local run.
const BIN = (() => {
  if (process.env.SMART_FFMPEG_BIN) return process.env.SMART_FFMPEG_BIN;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { const m = require('ffmpeg-static') as string | { default?: string }; return typeof m === 'string' ? m : m.default ?? null; } catch { return null; }
})();
const real = process.env.SMART_FFMPEG_IT === '1' && !!BIN && existsSync(BIN) ? describe : describe.skip;

real('renderSmartLayers with the real ffmpeg-static + resvg + FiraGO', () => {
  jest.setTimeout(120_000);
  it('lays Georgian captions, a title and a glitch on a 3 s clip; picture and sound survive', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'smart-it-'));
    const src = join(dir, 'src.mp4');
    execFileSync(BIN!, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src]);
    const live = liveSmartDeps();
    let saved = '';
    const deps: Pick<SmartDeps, 'rasterize' | 'ffmpegRun' | 'upload'> = {
      rasterize: live.rasterize,
      ffmpegRun: async (a) => { execFileSync(BIN!, a, { stdio: 'pipe' }); },
      upload: async (b) => { saved = join(dir, 'result.mp4'); await writeFile(saved, b); return saved; },
    };
    const url = await renderSmartLayers(deps, src, layers(), 540, 960, 3, dir);
    expect(url).toBe(saved);
    const info = (() => { try { execFileSync(BIN!, ['-hide_banner', '-i', saved]); return ''; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? ''); } })();
    expect(info).toMatch(/Video: h264/);
    expect(info).toMatch(/Audio: aac/);
    expect(info).toMatch(/Duration: 00:00:0(2\.9|3\.0)/);
    // a frame grab for a human look: SMART_IT_KEEP=1 leaves the folder
    execFileSync(BIN!, ['-y', '-v', 'error', '-ss', '1.0', '-i', saved, '-frames:v', '1', join(dir, 'frame.png')]);
    if (process.env.SMART_IT_KEEP === '1') console.log('kept', dir);
    else await rm(dir, { recursive: true, force: true });
  });
});
