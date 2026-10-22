/** @jest-environment node */
/**
 * Video Core v1.0 §13 (T3), round 3 — "real media pipeline verification": the film assembler on the REAL bundled ffmpeg
 * (ffmpeg-static 7.0.2, no ffprobe), offline, every provider mocked, every flag off. Same harness as
 * ffmpeg-assembly.ffmpeg.test (synthetic lavfi clips, "downloads" that read local files, "uploads" that write to a temp
 * dir); the numbers are counted on DECODED frames (lib/video/frameCount), never read off the container. Cases:
 *   · film60s          eight 8 s Veo-like clips (24 fps, 640×360, sine audio), cuts, contracted 60 s → 1800 frames at 30 fps;
 *   · mixedFps24s      four 6 s clips at 24 · 25 · 30 · 60 fps, contracted 24 s → 720 frames, one 30 fps timeline;
 *   · vertical9x16     four 8 s portrait clips (360×640), contracted 29.7 s → 891 frames on the 1080×1920 canvas;
 *   · singleClipNative8s (consolidation-plan D7) an 8 s clip ordered at 8 s: as delivered (192 frames @ 24 fps) and what
 *                      the conform WOULD make of it (cutMasterToLength → 240 frames @ 30 fps);
 *   · clipWithoutAudio one of four clips has no audio stream: does the stitch pad silence or fail? (observed, pinned);
 *   · invalidMusic     a soundtrack URL that is 64 KB of garbage: how the assembler fails, and that nothing is hosted;
 *   · qcRejectThenRetry the QC reads 890 of 891 → MasterQaRejected, nothing hosted; the SAME input again → 891 hosted;
 *   · audioLevels      volumedetect on the 60 s master and on a deliberately clipped (+20 dB) clip — informational.
 * OPT-IN (eight 1080p encodes, ~10 min on 2 threads):
 *   VIDEO_CORE_FFMPEG_IT=1 VIDEO_CORE_EVIDENCE_OUT=docs/handoffs/video-core/evidence/t3-round3-film.json \
 *     npx jest lib/orchestrator/videoCoreRound3.ffmpeg.test.ts
 * VIDEO_CORE_EVIDENCE_OUT=<file> writes the measured numbers, argv snapshots and the SHA (docs/handoffs/video-core/evidence).
 */
jest.mock('server-only', () => ({}));
jest.mock('../server/feature-flags', () => ({ getFeatureFlag: async () => false }));
jest.mock('../pipeline/compositing/ffmpeg-overlay', () => ({ renderOverlayPng: async () => null, renderMusicBugPng: async () => null }));
jest.mock('../pipeline/compositing/caption-burn', () => ({ burnCaptionSegments: async () => null }));
jest.mock('../security/allowlistedAudioFetch', () => ({ readBodyWithCap: async (res: Response) => Buffer.from(await res.arrayBuffer()) }));
// The frame counter is the REAL one, wrapped so one test can hand the QC a count that is off by a frame (the module's
// exports are not redefinable, so a jest.spyOn would not do).
jest.mock('../video/frameCount', () => {
  const actual = jest.requireActual('../video/frameCount');
  return { ...actual, countDecodedFrames: jest.fn(actual.countDecodedFrames) };
});
// Every ffmpeg argv the product spawns is recorded (the assembler's encode argv is otherwise invisible to a test): the
// REAL execFile runs, both as a callback (frameCount) and through util.promisify (the assembler's `exec`, whose
// {stdout, stderr} shape and the `.stderr` on a failure come from execFile's own promisify.custom — kept here).
const mockArgv: string[][] = [];
jest.mock('node:child_process', () => {
  const actual = jest.requireActual<typeof import('node:child_process')>('node:child_process');
  const { promisify } = jest.requireActual<typeof import('node:util')>('node:util');
  const note = (a: unknown[]) => { if (Array.isArray(a[1])) mockArgv.push([...(a[1] as string[])]); };
  const realExecFile = actual.execFile as unknown as ((...x: unknown[]) => unknown) & Record<symbol, (...x: unknown[]) => unknown>;
  const execFile = ((...a: unknown[]) => { note(a); return realExecFile(...a); }) as unknown as Record<symbol, unknown>;
  execFile[promisify.custom] = (...a: unknown[]) => { note(a); return realExecFile[promisify.custom]!(...a); };
  return { ...actual, execFile };
});

const mockFiles = new Map<string, string>();
jest.mock('../web/publicFetch', () => {
  const { readFileSync, copyFileSync, statSync } = jest.requireActual('node:fs');
  return {
    MEDIA_TYPES: /.*/,
    fetchPublic: async (url: string) => {
      const src = mockFiles.get(url.split('?')[0]!);
      if (!src) return { ok: false, error: 'fetch_failed' };
      return { ok: true, res: new Response(readFileSync(src)), url };
    },
    fetchPublicToFile: async (url: string, path: string) => {
      const src = mockFiles.get(url.split('?')[0]!);
      if (!src) return { ok: false, error: 'fetch_failed' };
      copyFileSync(src, path);
      return { ok: true, bytes: statSync(path).size, contentType: 'video/mp4' };
    },
  };
});
let mockOut = '';
const uploads: string[] = [];
jest.mock('./storage-adapter', () => {
  const { writeFileSync } = jest.requireActual('node:fs');
  const { join } = jest.requireActual('node:path');
  return {
    uploadBufferAndSign: async (_b: string, path: string, buf: Buffer) => {
      const local = join(mockOut, path.replace(/\//g, '_'));
      writeFileSync(local, buf);
      const url = `https://media.test/${path}`;
      mockFiles.set(url, local);
      uploads.push(url);
      return `${url}?token=t`;
    },
    removeStorageObjects: async () => {},
  };
});

import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { assembleWithFfmpeg } from './ffmpeg-assembly';
import { MasterQaRejected } from './masterQa';
import { cutMasterToLength } from '../video/finalCut';
import * as frameCount from '../video/frameCount';
import { decodedFrameArgs, parseDecodedFrames } from '../video/frameCount';
import { VIDEO_FPS, framesFor } from '../video/durationContract';

jest.setTimeout(900_000);
const bin = ffmpegStatic as unknown as string;
const enabled = process.env.VIDEO_CORE_FFMPEG_IT === '1' && typeof bin === 'string' && existsSync(bin);
const maybe = enabled ? describe : describe.skip;
let dir = '';
const evidence: Record<string, unknown> = { ffmpeg: null, sha: null, node: process.version, startedAt: new Date().toISOString(), cases: {} as Record<string, unknown> };
const cases = evidence.cases as Record<string, unknown>;

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out], { timeout: 120_000 });
  const url = `https://media.test/in/${name}`;
  mockFiles.set(url, out);
  return url;
}
const local = (url: string) => mockFiles.get(url.split('?')[0]!)!;
const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
/** A clip as Veo would hand one over: picture + a soundtrack (unless `audio: false` — then NO audio stream), `rate` fps, `sec` long. */
const clip = (name: string, sec: number, o: { rate?: number; size?: string; audio?: boolean; src?: string } = {}) => {
  const { rate = 24, size = '640x360', audio = true, src = 'testsrc' } = o;
  return make(name, [
    '-f', 'lavfi', '-i', `${src}=size=${size}:rate=${rate}:duration=${sec}`,
    ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${sec}`] : []),
    ...enc,
    ...(audio ? ['-c:a', 'aac', '-shortest'] : ['-an']),
  ]);
};

/** The container's Duration, the picture's frame rate and size, and whether an audio stream is there, as `ffmpeg -i` prints them (the assembler's own probe). */
function banner(path: string): { durationSec: number; fps: number | null; width: number | null; height: number | null; audio: boolean } {
  const r = spawnSync(bin, ['-hide_banner', '-i', path], { encoding: 'utf8' });
  const dm = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(r.stderr);
  const fm = /Video:[^\n]*?\s(\d+(?:\.\d+)?)\s+fps/.exec(r.stderr);
  const wm = /Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(r.stderr);
  return {
    durationSec: dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + parseFloat(dm[3]!) : NaN,
    fps: fm ? Number(fm[1]) : null,
    width: wm ? Number(wm[1]) : null,
    height: wm ? Number(wm[2]) : null,
    audio: /Stream #\d+:\d+[^\n]*:\s*Audio:/.test(r.stderr),
  };
}
/** DECODED frames, counted by the real ffmpeg directly (never through the wrapped counter the QC reads). */
function countReal(path: string): number | null {
  const r = spawnSync(bin, decodedFrameArgs(path), { encoding: 'utf8', maxBuffer: 1 << 24 });
  return parseDecodedFrames(r.stdout, r.stderr);
}
/** `ffmpeg -af volumedetect -f null -`: the peak and the mean of the audio, in dBFS, as printed on stderr. */
function volume(path: string): { maxDb: number | null; meanDb: number | null } {
  const r = spawnSync(bin, ['-hide_banner', '-nostdin', '-i', path, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const mx = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(r.stderr);
  const mn = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(r.stderr);
  return { maxDb: mx ? Number(mx[1]) : null, meanDb: mn ? Number(mn[1]) : null };
}
/** Everything measured on one file, in one object. */
function measure(path: string) {
  return { decodedFrames: countReal(path), banner: banner(path), sizeBytes: statSync(path).size };
}
/** The assembler's encode argv (the one with -filter_complex) recorded since `mark`, temp paths redacted. */
function encodeArgvSince(mark: number): string[] | null {
  const asm = new RegExp(`${join(tmpdir(), 'asm_').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^/\\s'"]+/`, 'g');
  const found = mockArgv.slice(mark).filter((a) => a.includes('-filter_complex')).pop();
  return found ? found.map((a) => a.replace(asm, '<asm>/')) : null;
}
const codes = (qa: { issues: { code: string }[] } | undefined) => qa?.issues.map((i) => i.code) ?? [];
const critical = (qa: { issues: { code: string; severity: string }[] } | undefined) => qa?.issues.filter((i) => i.severity === 'critical').map((i) => i.code) ?? [];
const landscape = (transition = 'cut'): Record<string, string> => ({ transition, orientation: 'landscape' });

let film60File: string | null = null;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'video-core-r3-'));
  mockOut = dir;
  if (enabled) {
    evidence.ffmpeg = spawnSync(bin, ['-version'], { encoding: 'utf8' }).stdout.split('\n')[0];
    const sha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
    evidence.sha = sha.status === 0 ? sha.stdout.trim() : null;
  }
});
afterAll(() => {
  evidence.finishedAt = new Date().toISOString();
  if (process.env.VIDEO_CORE_EVIDENCE_OUT) writeFileSync(process.env.VIDEO_CORE_EVIDENCE_OUT, JSON.stringify(evidence, null, 1));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

maybe('Video Core v1.0 round 3 — the film assembler on the real ffmpeg (T3)', () => {
  test('film60s: 8 × 8 s at 24 fps, cuts, contracted 60 s → a 30 fps master of exactly 1800 decoded frames, Duration 60.00, QA pass', async () => {
    const sources = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => clip(`f60_${i}.mp4`, 8));
    const segments = sources.map((url) => ({ url, durationSec: 8 }));
    const inputs = sources.map((u) => ({ fps: banner(local(u)).fps, decodedFrames: countReal(local(u)) }));
    const mark = mockArgv.length;
    const before = uploads.length;
    const t0 = Date.now();
    const r = await assembleWithFfmpeg({ segments, globalRender: landscape(), finalDurationSec: 60, pipelineId: 'vc-r3-film60' });
    const encodeMs = Date.now() - t0;
    const file = local(r.url);
    film60File = file;
    const m = measure(file);
    expect(m.decodedFrames).toBe(1800);
    expect(framesFor(60)).toBe(1800);
    expect(Math.abs(m.banner.durationSec - 60)).toBeLessThan(0.05);
    expect(m.banner.fps).toBe(VIDEO_FPS);
    expect(m.banner.audio).toBe(true);
    expect(r.qa?.pass).toBe(true);
    expect(critical(r.qa)).toEqual([]);
    expect(uploads.length).toBe(before + 1);
    cases.film60s = {
      requestedSec: 60, nativeSec: 64, finalSec: 60, expectedFrames: 1800, inputs: { count: 8, clipSec: 8, fps: 24, size: '640x360', measured: inputs },
      decodedFrames: m.decodedFrames, banner: m.banner, sizeBytes: m.sizeBytes, hosted: true, qa: r.qa, encodeMs, encodeArgv: encodeArgvSince(mark), countArgv: decodedFrameArgs('<master>'),
    };
  });

  test('mixedFps24s: 4 × 6 s at 24 · 25 · 30 · 60 fps, contracted 24 s → exactly 720 decoded frames on one 30 fps timeline', async () => {
    const rates = [24, 25, 30, 60];
    const sources = rates.map((rate, i) => clip(`mix_${i}_${rate}.mp4`, 6, { rate }));
    const inputs = sources.map((u, i) => ({ requestedFps: rates[i], ...measure(local(u)) }));
    const segments = sources.map((url) => ({ url, durationSec: 6 }));
    const mark = mockArgv.length;
    const r = await assembleWithFfmpeg({ segments, globalRender: landscape(), finalDurationSec: 24, pipelineId: 'vc-r3-mixed' });
    const m = measure(local(r.url));
    expect(inputs.map((i) => i.banner.fps)).toEqual(rates);
    expect(inputs.map((i) => i.decodedFrames)).toEqual(rates.map((f) => f * 6));
    expect(m.decodedFrames).toBe(720);
    expect(m.banner.fps).toBe(VIDEO_FPS);
    expect(Math.abs(m.banner.durationSec - 24)).toBeLessThan(0.05);
    expect(r.qa?.pass).toBe(true);
    cases.mixedFps24s = { requestedSec: 24, nativeSec: 24, finalSec: 24, expectedFrames: 720, inputs, decodedFrames: m.decodedFrames, banner: m.banner, sizeBytes: m.sizeBytes, hosted: true, qa: r.qa, encodeArgv: encodeArgvSince(mark) };
  });

  test('vertical9x16: 4 × 8 s portrait clips (360×640), contracted 29.7 s → 891 frames, the master taller than wide', async () => {
    const sources = [0, 1, 2, 3].map((i) => clip(`v9x16_${i}.mp4`, 8, { size: '360x640' }));
    const inputs = sources.map((u) => { const b = banner(local(u)); return { width: b.width, height: b.height, fps: b.fps }; });
    const segments = sources.map((url) => ({ url, durationSec: 8 }));
    const r = await assembleWithFfmpeg({ segments, globalRender: { transition: 'cut', orientation: 'vertical' }, finalDurationSec: 29.7, pipelineId: 'vc-r3-vertical' });
    const m = measure(local(r.url));
    expect(m.decodedFrames).toBe(891);
    expect(m.banner.fps).toBe(VIDEO_FPS);
    expect(m.banner.height).toBeGreaterThan(m.banner.width ?? Infinity);
    expect(Math.abs(m.banner.durationSec - 29.7)).toBeLessThan(0.05);
    expect(r.qa?.pass).toBe(true);
    cases.vertical9x16 = { requestedSec: 29.7, nativeSec: 32, finalSec: 29.7, expectedFrames: 891, inputs, decodedFrames: m.decodedFrames, banner: m.banner, width: m.banner.width, height: m.banner.height, sizeBytes: m.sizeBytes, hosted: true, qa: r.qa };
  });

  test('singleClipNative8s (D7): an 8 s clip ordered at 8 s is delivered untouched (192 frames @ 24 fps); cutMasterToLength(url, 8) would conform it to 240 frames @ 30 fps', async () => {
    const url = clip('single8.mp4', 8);
    const delivered = measure(local(url));
    // (a) D7: the final IS the native length, the route hands the provider's file over as made — no encode, no 30 fps grid.
    expect(delivered.decodedFrames).toBe(192);
    expect(delivered.banner.fps).toBe(24);
    expect(Math.abs(delivered.banner.durationSec - 8)).toBeLessThan(0.05);
    // (b) what the conform WOULD do: the same cut the single-clip path runs when the final is shorter than the clip.
    const before = uploads.length;
    const t0 = Date.now();
    const cutUrl = await cutMasterToLength(url, 8);
    const cutMs = Date.now() - t0;
    expect(cutUrl).toMatch(/films\/final-\d+-240f-/);
    expect(uploads.length).toBe(before + 1);
    const conformed = measure(local(cutUrl));
    expect(conformed.decodedFrames).toBe(240);
    expect(conformed.banner.fps).toBe(VIDEO_FPS);
    expect(Math.abs(conformed.banner.durationSec - 8)).toBeLessThan(0.05);
    cases.singleClipNative8s = {
      decision: 'consolidation-plan D7: delivered as the provider made it (no conform, no new charge) until GG says the grid matters more',
      asDelivered: { ...delivered, note: 'the clip itself, untouched: 24 fps, not on the 30 fps grid' },
      ifConformed: { ...conformed, hosted: true, cutMs, note: 'cutMasterToLength(url, 8): what one more encode would deliver' },
    };
  });

  test('clipWithoutAudio: 4 × 8 s where clip 3 has NO audio stream, contracted 29.7 s, no soundtrack → stitched with silence in its place, 891 frames hosted, QA A (observed)', async () => {
    const sources = [0, 1, 2, 3].map((i) => clip(`noaud_${i}.mp4`, 8, { audio: i !== 2 }));
    const inputs = sources.map((u) => banner(local(u)).audio);
    expect(inputs).toEqual([true, true, false, true]);
    const segments = sources.map((url) => ({ url, durationSec: 8 }));
    const before = uploads.length;
    const mark = mockArgv.length;
    let result: { url: string; qa?: { pass: boolean; issues: { code: string; severity: string }[] } } | null = null;
    let caught: unknown = null;
    try {
      result = await assembleWithFfmpeg({ segments, globalRender: landscape(), finalDurationSec: 29.7, pipelineId: 'vc-r3-noaudio' });
    } catch (err) { caught = err; }
    const hosted = uploads.length - before;
    const m = result ? measure(local(result.url)) : null;
    const err = caught as (Error & { issueCodes?: string[] }) | null;
    // The filtergraph's own answer to the silent clip, read off the encode argv: an `anullsrc` lane where `[2:a]` would be.
    const filter = encodeArgvSince(mark)?.find((a) => a.includes('anullsrc')) ?? '';
    const silentLanes = (filter.match(/anullsrc=r=48000:cl=stereo,atrim=0:8,asetpts=PTS-STARTPTS,[^\]]*\[na(\d)\]/g) ?? []).map((s) => Number(/\[na(\d)\]/.exec(s)![1]));
    cases.clipWithoutAudio = {
      requestedSec: 29.7, inputAudio: inputs, hosted: hosted > 0, uploadsAdded: hosted,
      outcome: result ? 'hosted' : 'threw',
      thrown: err ? { name: err.name, message: err.message.split('\n')[0]!.slice(0, 300), issueCodes: err.issueCodes ?? null } : null,
      qa: result?.qa ?? null, qaCodes: codes(result?.qa), decodedFrames: m?.decodedFrames ?? null, banner: m?.banner ?? null, sizeBytes: m?.sizeBytes ?? null,
      filtergraph: { silenceLanes: silentLanes, note: 'clip indexes whose audio lane the graph built from anullsrc (the clip has no audio stream)' },
    };
    expect(silentLanes).toEqual([2]);
    // OBSERVED (2026-10-12, ffmpeg 7.0.2-static, tree dac6106): the assembler probes each clip for an audio stream
    // (probeHasAudio → nativeAudio [true, true, false, true]) and the filtergraph feeds `anullsrc` in place of the
    // silent clip's lane, so the stitch does NOT fail: the master is hosted with an audio stream (the other three clips'
    // sound, 8 s of silence for clip 3), 891 decoded frames, QA grade A with no silent_master / empty_master.
    expect(caught).toBeNull();
    expect(result).not.toBeNull();
    expect(hosted).toBe(1);
    expect(m?.decodedFrames).toBe(891);
    expect(m?.banner.audio).toBe(true);
    expect(m?.banner.fps).toBe(VIDEO_FPS);
    expect(result?.qa?.pass).toBe(true);
    expect(codes(result?.qa)).not.toContain('silent_master');
    expect(codes(result?.qa)).not.toContain('empty_master');
    expect(critical(result?.qa)).toEqual([]);
  });

  test('invalidMusic: 4 × 8 s contracted 29.7 s with a soundtrack URL that is 64 KB of garbage → the assembler refuses the lane BEFORE any encode (SoundtrackUnreadable, music_unreadable), nothing hosted', async () => {
    const sources = [0, 1, 2, 3].map((i) => clip(`badmus_${i}.mp4`, 8));
    const garbage = join(dir, 'music.mp3');
    writeFileSync(garbage, randomBytes(64 * 1024));
    const musicUrl = 'https://media.test/in/music.mp3';
    mockFiles.set(musicUrl, garbage);
    const segments = sources.map((url) => ({ url, durationSec: 8 }));
    const before = uploads.length;
    const mark = mockArgv.length;
    let result: { url: string; qa?: { pass: boolean; issues: { code: string; severity: string }[] } } | null = null;
    let caught: unknown = null;
    const t0 = Date.now();
    try {
      result = await assembleWithFfmpeg({ segments, musicUrl, globalRender: landscape(), finalDurationSec: 29.7, pipelineId: 'vc-r3-badmusic' });
    } catch (err) { caught = err; }
    const ms = Date.now() - t0;
    const hosted = uploads.length - before;
    const err = caught as (Error & { code?: unknown; issueCodes?: string[]; stderr?: string }) | null;
    const lines = err ? err.message.split('\n').map((l) => l.trim()).filter(Boolean) : [];
    cases.invalidMusic = {
      requestedSec: 29.7, musicBytes: 64 * 1024, hosted: hosted > 0, uploadsAdded: hosted, ms,
      outcome: result ? 'hosted' : 'threw',
      thrown: err ? {
        name: err.name, isMasterQaRejected: err instanceof MasterQaRejected, code: err.code ?? null, issueCodes: err.issueCodes ?? null,
        firstLine: lines[0]?.slice(0, 160) ?? null, ffmpegLines: lines.filter((l) => /music\.m4a|Invalid data|Error|failed/i.test(l) && !/^Command failed/.test(l)).slice(-4),
      } : null,
      qa: result?.qa ?? null, qaCodes: codes(result?.qa),
      ffmpegRunsAfterDownload: mockArgv.slice(mark).filter((a) => a.includes('-filter_complex')).length,
      decodedFrames: result ? countReal(local(result.url)) : null,
    };
    // OBSERVED on 2361153 (2026-10-12, ffmpeg 7.0.2-static, evidence t3-round3-film.json): the soundtrack was downloaded
    // unchecked and handed to the ONE encode command as `-i music.m4a`; ffmpeg refused input #4 ("Invalid data found when
    // processing input", exit 183) in ~0.1 s and the assembler rejected with execFile's raw `Error` — unnamed, so the
    // route said assembly_failed. FIXED in round 3 (P1): every audio lane is probed for an audio stream after the download
    // (lib/orchestrator/soundtrackUnreadable), so the attempt ends BEFORE the encode command exists, as a named refusal.
    expect(result).toBeNull();
    expect(err?.name).toBe('SoundtrackUnreadable');
    expect(err?.code).toBe('music_unreadable');
    expect((err as { lane?: unknown } | null)?.lane).toBe('music');
    expect(caught).not.toBeInstanceOf(MasterQaRejected);
    expect(err?.issueCodes).toBeUndefined();
    expect(err?.message).toMatch(/^soundtrack lane: music_unreadable — /);
    expect(hosted).toBe(0);
    expect(mockArgv.slice(mark).filter((a) => a.includes('-filter_complex')).length).toBe(0); // no encode command was built
  });

  test('qcRejectThenRetry: the QC reads 890 of 891 → MasterQaRejected, nothing hosted; the SAME input again → 891 frames hosted (§7/§8 retry path)', async () => {
    const sources = [0, 1, 2, 3].map((i) => clip(`retry_${i}.mp4`, 8, { size: '320x180' }));
    const segments = sources.map((url) => ({ url, durationSec: 8 }));
    const manifest = { segments, globalRender: landscape(), finalDurationSec: 29.7, pipelineId: 'vc-r3-retry' };
    const before = uploads.length;
    // Attempt 1 — the encode is real; only the count the QC reads is forced one frame short.
    (frameCount.countDecodedFrames as jest.Mock).mockResolvedValueOnce(890);
    let caught: unknown = null;
    const t1 = Date.now();
    try { await assembleWithFfmpeg(manifest); } catch (err) { caught = err; }
    const attempt1Ms = Date.now() - t1;
    expect(caught).toBeInstanceOf(MasterQaRejected);
    const rej = caught as MasterQaRejected;
    expect(rej.issueCodes).toEqual(['frame_count_mismatch']);
    expect(rej.qa.pass).toBe(false);
    expect(uploads.length).toBe(before);
    // Attempt 2 — the real counter is back; the same manifest, re-run.
    const t2 = Date.now();
    const r = await assembleWithFfmpeg(manifest);
    const attempt2Ms = Date.now() - t2;
    const m = measure(local(r.url));
    expect(uploads.length).toBe(before + 1);
    expect(m.decodedFrames).toBe(891);
    expect(r.qa?.pass).toBe(true);
    expect(codes(r.qa)).not.toContain('frame_count_mismatch');
    cases.qcRejectThenRetry = {
      requestedSec: 29.7, expectedFrames: 891,
      attempt1: { countedByQc: 890, thrown: rej.name, code: rej.code, issueCodes: rej.issueCodes, qa: rej.qa, hosted: false, ms: attempt1Ms },
      attempt2: { decodedFrames: m.decodedFrames, banner: m.banner, sizeBytes: m.sizeBytes, hosted: true, qa: r.qa, ms: attempt2Ms },
    };
  });

  test('audioLevels (informational): volumedetect on the 60 s master, on a plain sine clip, and on a +20 dB clip that clips at 0.0 dB', () => {
    const master = film60File ? volume(film60File) : null;
    const plain = volume(local(clip('lvl_plain.mp4', 4)));
    // sine amplitude 1.0 (aevalsrc), then +20 dB: the AAC master can hold no more than 0 dBFS, so the peak reads 0.0 dB (clipped).
    const hot = volume(local(make('lvl_hot.mp4', [
      '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24:duration=4',
      '-f', 'lavfi', '-i', 'aevalsrc=sin(440*2*PI*t):s=48000:d=4',
      '-af', 'volume=20dB', ...enc, '-c:a', 'aac', '-shortest',
    ])));
    for (const v of [plain, hot, ...(master ? [master] : [])]) {
      expect(Number.isFinite(v.maxDb)).toBe(true);
      expect(Number.isFinite(v.meanDb)).toBe(true);
    }
    cases.audioLevels = {
      argv: ['-hide_banner', '-nostdin', '-i', '<file>', '-vn', '-af', 'volumedetect', '-f', 'null', '-'],
      film60sMaster: master ? { ...master, note: 'the stitched master after the filtergraph loudnorm I=-14:TP=-1.5' } : { note: 'film60s did not produce a master in this run' },
      plainSine: { ...plain, note: 'sine=frequency=440 as the clips use it, AAC' },
      hotSine20dB: { ...hot, note: 'aevalsrc sin() at amplitude 1.0, volume=20dB, AAC — a peak at 0.0 dB is the clip ceiling' },
    };
  });
});

if (!enabled) {
  test('the round-3 real-ffmpeg film evidence is opt-in (VIDEO_CORE_FFMPEG_IT=1); its last run is docs/handoffs/video-core/evidence/t3-round3-film.json', () => {
    expect(enabled).toBe(false);
  });
}
