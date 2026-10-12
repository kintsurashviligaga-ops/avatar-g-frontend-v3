/** @jest-environment node */
/**
 * Video Core v1.0 §4 / §13 (T3) — the film assembler on the REAL bundled ffmpeg (ffmpeg-static), offline: synthetic lavfi
 * clips, "downloads" that read local files, "uploads" that write to a temp dir, every flag off. The numbers measured are
 * the owner's table, counted on DECODED frames (lib/video/frameCount), never read off the container:
 *   · four 8 s clips, cuts, contracted 29.7 s → a 30 fps master of exactly 891 frames, Duration 29.70, QA with no
 *     frame_count_mismatch (Requested 29.7 · Native 32 · Final 29.7);
 *   · four 6 s clips contracted 24 s → 720 frames; the SAME clips with no contract → the legacy 30 s brand pad
 *     (a cloned, frozen last frame), 720 frames at 24 fps — the freeze the contract removes, measured;
 *   · the single-clip cut (lib/video/finalCut): a 6 s clip asked at 5 s → 150 frames; a 32 s clip at 29.7 s → 891;
 *   · four 8 s clips with 1 s crossfades stitch to 29 s: 29.7 s cannot be cut from that → the assembler REFUSES
 *     (longer_than_master) before any encode, and nothing is hosted;
 *   · the gate (§7/§8): a master whose decoded count misses the contract by one frame is WITHHELD (MasterQaRejected,
 *     nothing hosted), and the single-clip cut throws instead of hosting a cut whose count is off.
 * OPT-IN (four 1080p encodes, ~5 min on 2 threads): VIDEO_CORE_FFMPEG_IT=1 npx jest lib/orchestrator/ffmpeg-assembly.ffmpeg.test.ts
 * VIDEO_CORE_EVIDENCE_OUT=<file> writes the measured numbers and argv snapshots (docs/handoffs/video-core/evidence).
 */
jest.mock('server-only', () => ({}));
jest.mock('../server/feature-flags', () => ({ getFeatureFlag: async () => false }));
jest.mock('../providers/mediaPolicy', () => ({ isMediaGoogleOnly: () => true }));
jest.mock('../pipeline/compositing/ffmpeg-overlay', () => ({ renderOverlayPng: async () => null, renderMusicBugPng: async () => null }));
jest.mock('../pipeline/compositing/caption-burn', () => ({ burnCaptionSegments: async () => null }));
jest.mock('../security/allowlistedAudioFetch', () => ({ readBodyWithCap: async (res: Response) => Buffer.from(await res.arrayBuffer()) }));
// The frame counter is the REAL one, wrapped so one test can hand the QC a count that is off by a frame (the module's
// exports are not redefinable, so a jest.spyOn would not do).
jest.mock('../video/frameCount', () => {
  const actual = jest.requireActual('../video/frameCount');
  return { ...actual, countDecodedFrames: jest.fn(actual.countDecodedFrames) };
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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { assembleWithFfmpeg } from './ffmpeg-assembly';
import { MasterQaRejected } from './masterQa';
import { finalCutArgs, cutMasterToLength } from '../video/finalCut';
import * as frameCount from '../video/frameCount';
import { countDecodedFrames, decodedFrameArgs, frameExactVerdict } from '../video/frameCount';
import { framesFor } from '../video/durationContract';

jest.setTimeout(900_000);
const bin = ffmpegStatic as unknown as string;
const enabled = process.env.VIDEO_CORE_FFMPEG_IT === '1' && typeof bin === 'string' && existsSync(bin);
const maybe = enabled ? describe : describe.skip;
let dir = '';
const evidence: Record<string, unknown> = { ffmpeg: null, cases: {} as Record<string, unknown> };
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
/** A clip as Veo would hand one over: picture + a soundtrack, `rate` fps, `sec` long. */
const clip = (name: string, sec: number, rate = 24, src = 'testsrc', size = '640x360') =>
  make(name, ['-f', 'lavfi', '-i', `${src}=size=${size}:rate=${rate}:duration=${sec}`, '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${sec}`, ...enc, '-c:a', 'aac', '-shortest']);

/** The container's Duration and the picture's frame rate, as `ffmpeg -i` prints them (the assembler's own probe). */
function banner(path: string): { durationSec: number; fps: number | null } {
  const r = spawnSync(bin, ['-hide_banner', '-i', path], { encoding: 'utf8' });
  const dm = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(r.stderr);
  const fm = /Video:[^\n]*?\s(\d+(?:\.\d+)?)\s+fps/.exec(r.stderr);
  return { durationSec: dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + parseFloat(dm[3]!) : NaN, fps: fm ? Number(fm[1]) : null };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'video-core-t3-'));
  mockOut = dir;
  if (enabled) evidence.ffmpeg = spawnSync(bin, ['-version'], { encoding: 'utf8' }).stdout.split('\n')[0];
});
afterAll(() => {
  if (process.env.VIDEO_CORE_EVIDENCE_OUT) writeFileSync(process.env.VIDEO_CORE_EVIDENCE_OUT, JSON.stringify(evidence, null, 1));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

maybe('the film assembler, contracted (Video Core v1.0 §4), on the real ffmpeg', () => {
  test('4 × 8 s, cuts, requested 29.7 s → 891 decoded frames at 30 fps, Duration 29.70, QA passes the frame check', async () => {
    const segments = [0, 1, 2, 3].map((i) => ({ url: clip(`a8_${i}.mp4`, 8), durationSec: 8 }));
    const t0 = Date.now();
    const r = await assembleWithFfmpeg({ segments, globalRender: { transition: 'cut', orientation: 'landscape' }, finalDurationSec: 29.7, pipelineId: 'vc-t3-a' });
    const file = local(r.url);
    const frames = await countDecodedFrames(bin, file);
    const b = banner(file);
    expect(frames).toBe(891);
    expect(frameExactVerdict(frames, 29.7)).toMatchObject({ ok: true, expected: 891 });
    expect(Math.abs(b.durationSec - 29.7)).toBeLessThan(0.05);
    expect(b.fps).toBe(30);
    expect(r.qa?.issues.map((i) => i.code) ?? []).not.toContain('frame_count_mismatch');
    expect(r.qa?.pass).toBe(true);
    cases.a_29_7 = { requestedSec: 29.7, nativeSec: 32, finalSec: 29.7, expectedFrames: framesFor(29.7), decodedFrames: frames, banner: b, qa: r.qa, encodeMs: Date.now() - t0, countArgv: decodedFrameArgs('<master>') };
  });

  test('4 × 6 s, cuts, requested 24 s → 720 frames at 30 fps; the same clips with NO contract → the legacy 30 s pad (frozen tail) at 24 fps', async () => {
    const segments = [0, 1, 2, 3].map((i) => ({ url: clip(`b6_${i}.mp4`, 6), durationSec: 6 }));
    const r = await assembleWithFfmpeg({ segments, globalRender: { transition: 'cut', orientation: 'landscape' }, finalDurationSec: 24, pipelineId: 'vc-t3-b' });
    const file = local(r.url);
    const frames = await countDecodedFrames(bin, file);
    const b = banner(file);
    expect(frames).toBe(720);
    expect(Math.abs(b.durationSec - 24)).toBeLessThan(0.05);
    expect(b.fps).toBe(30);
    expect(r.qa?.pass).toBe(true);

    const legacy = await assembleWithFfmpeg({ segments, globalRender: { transition: 'cut', orientation: 'landscape' }, pipelineId: 'vc-t3-b-legacy' });
    const lf = local(legacy.url);
    const lframes = await countDecodedFrames(bin, lf);
    const lb = banner(lf);
    // 4 clips × 6 s = 24 s of footage padded to the 30 s brand target with a cloned last frame: 30 s × 24 fps.
    expect(Math.abs(lb.durationSec - 30)).toBeLessThan(0.05);
    expect(lb.fps).toBe(24);
    expect(lframes).toBe(720);
    cases.b_24 = { contract: { requestedSec: 24, nativeSec: 24, finalSec: 24, decodedFrames: frames, banner: b, qa: r.qa }, legacyNoContract: { footageSec: 24, decodedFrames: lframes, banner: lb, note: 'padded to 30 s by cloning the last frame (ffmpeg-filtergraph MASTER_TARGET_SEC); off under a contract' } };
  });

  test('4 × 8 s with 1 s crossfades stitch to 29 s: 29.7 s is refused (longer_than_master) before any encode, nothing hosted', async () => {
    const segments = [0, 1, 2, 3].map((i) => ({ url: clip(`c8_${i}.mp4`, 8), durationSec: 8 }));
    const before = uploads.length;
    await expect(assembleWithFfmpeg({ segments, globalRender: { transition: 'crossfade', orientation: 'landscape' }, finalDurationSec: 29.7, pipelineId: 'vc-t3-c' }))
      .rejects.toThrow(/final duration refused: longer_than_master \(master 29s, requested 29.7s\)/);
    expect(uploads.length).toBe(before);
    cases.c_refusal = { joins: 'crossfade ×3 (1 s each)', nativeSec: 32, stitchedSec: 29, requestedSec: 29.7, refused: 'longer_than_master', hosted: false };
  });

  test('a master whose decoded count misses the contract (890 of 891) is WITHHELD: MasterQaRejected, nothing hosted (§7/§8)', async () => {
    // The encode is real; only the count the QC reads is forced one frame short, the way a dropped frame would read.
    const segments = [0, 1, 2, 3].map((i) => ({ url: clip(`e8_${i}.mp4`, 8, 24, 'testsrc', '320x180'), durationSec: 8 }));
    const before = uploads.length;
    (frameCount.countDecodedFrames as jest.Mock).mockResolvedValueOnce(890);
    let caught: unknown = null;
    try {
      await assembleWithFfmpeg({ segments, globalRender: { transition: 'cut', orientation: 'landscape' }, finalDurationSec: 29.7, pipelineId: 'vc-t3-e' });
    } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(MasterQaRejected);
    const rej = caught as MasterQaRejected;
    expect(rej.issueCodes).toEqual(['frame_count_mismatch']);
    expect(rej.qa.pass).toBe(false);
    expect(rej.message).toMatch(/master holds 890 frames, the contracted final is 891 \(-1\)/);
    expect(uploads.length).toBe(before); // the rejected master never reached storage
    cases.e_withheld = { requestedSec: 29.7, expectedFrames: 891, countedFrames: 890, thrown: rej.name, codes: rej.issueCodes, hosted: false, qa: rej.qa };
  });
});

maybe('the single-clip final cut (lib/video/finalCut) on the real ffmpeg', () => {
  test('a 6 s clip asked at 5 s → 150 frames; a 32 s clip at 29.7 s → 891 frames', () => {
    const six = local(clip('single6.mp4', 6, 24, 'testsrc2', '320x240'));
    const out5 = join(dir, 'final5.mp4');
    const argv5 = finalCutArgs(six, out5, 5);
    execFileSync(bin, ['-hide_banner', '-loglevel', 'error', ...argv5], { timeout: 120_000 });
    const f5 = spawnSync(bin, decodedFrameArgs(out5), { encoding: 'utf8' });
    const frames5 = Number(/frame=\s*(\d+)\s*$/m.exec([...f5.stdout.matchAll(/^frame=\s*\d+\s*$/gm)].pop()?.[0] ?? '')?.[1]);
    expect(frames5).toBe(150);
    expect(Math.abs(banner(out5).durationSec - 5)).toBeLessThan(0.05);

    const long = local(clip('single32.mp4', 32, 24, 'testsrc2', '320x240'));
    const out297 = join(dir, 'final297.mp4');
    execFileSync(bin, ['-hide_banner', '-loglevel', 'error', ...finalCutArgs(long, out297, 29.7)], { timeout: 180_000 });
    const f297 = spawnSync(bin, decodedFrameArgs(out297), { encoding: 'utf8' });
    const frames297 = Number(/frame=\s*(\d+)\s*$/m.exec([...f297.stdout.matchAll(/^frame=\s*\d+\s*$/gm)].pop()?.[0] ?? '')?.[1]);
    expect(frames297).toBe(891);
    expect(Math.abs(banner(out297).durationSec - 29.7)).toBeLessThan(0.05);
    cases.d_single_cut = { fiveFromSix: { argv: argv5.map((a) => (a === six ? '<in.mp4>' : a === out5 ? '<out.mp4>' : a)), decodedFrames: frames5, banner: banner(out5) }, twentyNine7From32: { decodedFrames: frames297, banner: banner(out297) } };
  });

  test('cutMasterToLength hosts a 5 s cut that counts 150 frames, and throws (hosting nothing) when the count is off (§7/§8)', async () => {
    const six = local(clip('single6b.mp4', 6, 24, 'testsrc2', '320x240'));
    const before = uploads.length;
    const url = await cutMasterToLength(six, 5);
    expect(url).toMatch(/films\/final-\d+-150f-/);
    expect(uploads.length).toBe(before + 1);
    expect(await countDecodedFrames(bin, local(url))).toBe(150);

    (frameCount.countDecodedFrames as jest.Mock).mockResolvedValueOnce(149);
    await expect(cutMasterToLength(six, 5)).rejects.toThrow(/final cut: frame_count_mismatch — the cut holds 149 frames, the contracted final is 150 \(-1\)/);
    expect(uploads.length).toBe(before + 1); // the off cut was not hosted
    cases.f_single_cut_gate = { fiveFromSix: { hosted: true, decodedFrames: 150 }, forcedOff: { countedFrames: 149, expectedFrames: 150, thrown: true, hosted: false } };
  });
});

if (!enabled) {
  test('the real-ffmpeg film evidence is opt-in (VIDEO_CORE_FFMPEG_IT=1); its last run is docs/handoffs/video-core/evidence', () => {
    expect(enabled).toBe(false);
  });
}
