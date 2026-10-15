/** @jest-environment node */
/**
 * Video Core v1.0 round 3 (owner, 2026-10-12 18:17Z, FFmpeg items 5, 7 and 10) on the REAL bundled ffmpeg, offline:
 * speed-up and slow motion, audio/video sync, and the integrity of what is delivered — measured on the decoded frames
 * and the decoded samples of the output, never on the container's duration.
 *
 * The source is a marker clip: black at 30 fps with ONE white frame at 2.000 s, and silence with a 1 kHz beep that
 * starts at 2.000 s. Through Agent G's edit lane (lib/agent/media/editLive renderEdit, the filter graph of editPlan):
 *   - 2× faster: the length halves (6 s → 3 s = 90 frames on the 30 fps grid), the flash lands at 1.000 s, the beep with it;
 *   - 0.5× (slow motion): the length doubles (4 s → 8 s = 240 frames), the flash at 4.000 s, the beep with it;
 *   - a 24 fps marker clip re-framed to 9:16 at 1× keeps flash and beep together through the re-encode;
 *   - every output decodes end to end with no error (`-xerror`), and its decoded frame count is printed beside the
 *     container's duration; a truncated copy of a good master fails the same integrity decode and its frame count
 *     falls short of the contract, so the QC verdict refuses it (frameExactVerdict count_mismatch).
 * The picture is judged to the frame (one frame at 30 fps, 33.3 ms). The sound is judged against the detectability
 * window of ITU-R BT.1359 (sound ahead of the picture by less than 45 ms, behind by less than 125 ms): a time-stretched
 * beep starts a few milliseconds early by the nature of the stretch (measured: −10 ms at 2×, −35 ms at 0.5×).
 * VIDEO_CORE_SPEED_OUT=<file> records every number.
 */
jest.mock('server-only', () => ({}));
jest.mock('./montageLive', () => ({ audit: async () => {}, quoteKey: () => 'k', every: () => () => {} }));
jest.mock('../../security/callerMedia', () => ({ resolveCallerMedia: async () => ({ ok: false, reason: 'unreadable' }) }));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: async () => null, reSignIfInternal: async (u: string) => u }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => null }));
jest.mock('../../observability/report-error', () => ({ reportError: () => {} }));

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { parseProbeBanner, type BannerProbe } from '../../video/probeBanner';
import { countDecodedFrames, frameExactVerdict } from '../../video/frameCount';
import { renderEdit } from './editLive';
import { qcEdit, resolveEdits } from './editPlan';

jest.setTimeout(300_000);
const bin = ffmpegStatic as unknown as string;
const FRAME_30 = 1 / 30;
/** ITU-R BT.1359 detectability: sound may lead the picture by under 45 ms, or lag it by under 125 ms. */
const inSync = (offsetMs: number | null) => offsetMs !== null && offsetMs > -45 && offsetMs < 125;
let dir = '';
const record: Record<string, unknown> = {};

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  return out;
}

function banner(path: string): BannerProbe {
  const r = spawnSync(bin, ['-hide_banner', '-i', path]);
  return parseProbeBanner(String(r.stderr ?? ''));
}

/** A marker clip: black, one white frame at `atSec`, and a 1 kHz beep from `atSec` for 0.1 s, at `fps`. */
function markerClip(name: string, fps: number, durationSec: number, atSec: number): string {
  return make(name, [
    '-f', 'lavfi', '-i', `color=black:s=320x180:r=${fps}:d=${durationSec},drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,${atSec},${atSec + 0.5 / fps})'`,
    '-f', 'lavfi', '-i', `aevalsrc='if(between(t,${atSec},${atSec + 0.1}),0.8*sin(2*PI*1000*t),0)':s=48000:d=${durationSec}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest',
  ]);
}

/** The presentation time of every decoded frame and its mean luma (0–255), in decode order. */
function frameLumas(path: string): Array<{ t: number; y: number }> {
  const r = spawnSync(bin, ['-hide_banner', '-nostats', '-i', path, '-map', '0:v:0', '-fps_mode', 'passthrough', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { maxBuffer: 1 << 26 });
  const text = String(r.stderr ?? '');
  const out: Array<{ t: number; y: number }> = [];
  const re = /pts_time:([\d.]+)[\s\S]*?lavfi\.signalstats\.YAVG=([\d.]+)/g;
  for (const m of text.matchAll(re)) out.push({ t: Number(m[1]), y: Number(m[2]) });
  return out;
}

/** The first moment the picture turns white, and the first moment the sound rises above silence. */
function onsets(path: string): { flashSec: number | null; beepSec: number | null } {
  const lumas = frameLumas(path);
  const flash = lumas.find((f) => f.y > 128);
  const pcm = execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-i', path, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 1 << 27 });
  // The beep's onset as heard: the first 5 ms window whose RMS reaches half the loudest window's (a time-stretcher
  // smears a few milliseconds of its window ahead of the edge; half the peak is where the beep is actually there).
  const WIN = 240;
  const rms: number[] = [];
  for (let i = 0; i + WIN * 2 <= pcm.length; i += WIN * 2) {
    let acc = 0;
    for (let j = 0; j < WIN; j += 1) { const v = pcm.readInt16LE(i + j * 2); acc += v * v; }
    rms.push(Math.sqrt(acc / WIN));
  }
  const peak = Math.max(0, ...rms);
  const at = peak > 1000 ? rms.findIndex((r) => r >= peak / 2) : -1;
  return { flashSec: flash ? flash.t : null, beepSec: at >= 0 ? (at * WIN) / 48000 : null };
}

/** A full decode that stops at the first error: exit 0 and nothing on stderr is an intact file. */
function integrity(path: string): { exit: number | null; errors: string } {
  const r = spawnSync(bin, ['-hide_banner', '-nostats', '-v', 'error', '-xerror', '-i', path, '-f', 'null', '-'], { maxBuffer: 1 << 24 });
  return { exit: r.status, errors: String(r.stderr ?? '').trim().slice(0, 300) };
}

async function edit(path: string, asks: unknown[]) {
  const r = resolveEdits(asks, banner(path));
  if (!r.ok) throw new Error(`${r.error}: ${r.message}`);
  const out = await renderEdit(path, { edits: r.edits, plan: r.plan }, { signal: new AbortController().signal });
  if (!out.ok) throw new Error(`${out.error}: ${out.detail}`);
  const file = join(dir, `out-${Math.random().toString(36).slice(2)}.${r.plan.output}`);
  writeFileSync(file, out.bytes);
  return { plan: r.plan, file, qc: qcEdit(out.output, r.plan, out.bytes.byteLength) };
}

async function measure(label: string, file: string, plannedSec: number) {
  const b = banner(file);
  const frames = await countDecodedFrames(bin, file);
  const o = onsets(file);
  const ok = integrity(file);
  const row = {
    plannedSec, containerSec: b.durationSec, size: b.width && b.height ? `${b.width}x${b.height}` : null, hasAudio: b.hasAudio,
    decodedFrames: frames, flashSec: o.flashSec, beepSec: o.beepSec,
    avOffsetMs: o.flashSec !== null && o.beepSec !== null ? Math.round((o.beepSec - o.flashSec) * 1000 * 10) / 10 : null,
    integrity: ok,
  };
  record[label] = row;
  return row;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'vc-speed-sync-'));
});

afterAll(() => {
  if (process.env.VIDEO_CORE_SPEED_OUT) {
    writeFileSync(process.env.VIDEO_CORE_SPEED_OUT, `${JSON.stringify({ ffmpeg: String(spawnSync(bin, ['-version']).stdout).split('\n')[0], measured: record }, null, 2)}\n`);
  }
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('the marker source itself: one white frame and the beep at 2.000 s, together', async () => {
  const src = markerClip('src30.mp4', 30, 6, 2);
  const m = await measure('source30', src, 6);
  expect(m.decodedFrames).toBe(180);
  expect(m.flashSec).toBeCloseTo(2, 2);
  expect(Math.abs(m.beepSec! - 2)).toBeLessThan(FRAME_30);
  expect(Math.abs(m.avOffsetMs!)).toBeLessThan(FRAME_30 * 1000);
  expect(m.integrity).toEqual({ exit: 0, errors: '' });
});

test('2× faster: 6 s → 3 s = 90 frames at 30 fps, the flash at 1.000 s and the beep with it; the file decodes clean', async () => {
  const src = markerClip('fast-src.mp4', 30, 6, 2);
  const r = await edit(src, [{ op: 'speed', factor: 2 }]);
  expect(r.plan.durationSec).toBe(3);
  expect(r.qc.ok).toBe(true);
  const m = await measure('speed2x', r.file, 3);
  expect(Math.abs(m.containerSec! - 3)).toBeLessThan(0.1);
  // Decoded frames over the decoded fps: the picture's own length, not the container's.
  expect(m.decodedFrames).not.toBeNull();
  expect(m.decodedFrames).toBe(90); // 3 s on the 30 fps grid
  expect(Math.abs(m.flashSec! - 1)).toBeLessThan(FRAME_30 / 2);
  expect(inSync(m.avOffsetMs)).toBe(true);
  expect(m.integrity).toEqual({ exit: 0, errors: '' });
});

test('0.5× slow motion: 4 s → 8 s = 240 frames at 30 fps, the flash at 4.000 s and the beep with it; the file decodes clean', async () => {
  const src = markerClip('slow-src.mp4', 30, 4, 2);
  const r = await edit(src, [{ op: 'speed', factor: 0.5 }]);
  expect(r.plan.durationSec).toBe(8);
  expect(r.qc.ok).toBe(true);
  const m = await measure('speed0_5x', r.file, 8);
  expect(Math.abs(m.containerSec! - 8)).toBeLessThan(0.1);
  expect(m.decodedFrames).not.toBeNull();
  expect(m.decodedFrames).toBe(240); // 8 s on the 30 fps grid
  expect(Math.abs(m.flashSec! - 4)).toBeLessThan(FRAME_30 / 2);
  expect(inSync(m.avOffsetMs)).toBe(true);
  expect(m.integrity).toEqual({ exit: 0, errors: '' });
});

test('a 24 fps marker clip re-framed to 9:16 keeps flash and beep together through the re-encode', async () => {
  const src = markerClip('src24.mp4', 24, 5, 2);
  const r = await edit(src, [{ op: 'aspect', to: '9:16' }]);
  expect(r.qc.ok).toBe(true);
  const m = await measure('vertical24fps', r.file, 5);
  expect(m.size).toBe(`${r.plan.width}x${r.plan.height}`);
  expect(r.plan.height).toBeGreaterThan(r.plan.width);
  expect(Math.abs(m.flashSec! - 2)).toBeLessThan(FRAME_30);
  expect(m.decodedFrames).toBe(120); // a 1× edit keeps the source's own 24 fps: 5 s = 120 frames
  expect(inSync(m.avOffsetMs)).toBe(true);
  expect(m.integrity).toEqual({ exit: 0, errors: '' });
});

test('a truncated master fails the integrity decode and falls short of its frame contract, so the QC refuses it', async () => {
  // A good 29.7 s master on the 30 fps grid: 891 decoded frames.
  const good = make('master297.mp4', [
    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=29.7', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=29.7',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '30', '-c:a', 'aac', '-movflags', '+faststart', '-shortest',
  ]);
  const goodFrames = await countDecodedFrames(bin, good);
  expect(frameExactVerdict(goodFrames, 29.7)).toMatchObject({ ok: true, expected: 891, actual: 891 });
  const goodIntegrity = integrity(good);
  expect(goodIntegrity).toEqual({ exit: 0, errors: '' });

  const bytes = readFileSync(good);
  const cut = join(dir, 'master297-truncated.mp4');
  writeFileSync(cut, bytes.subarray(0, Math.floor(bytes.length * 0.6)));
  const cutIntegrity = integrity(cut);
  const cutFrames = await countDecodedFrames(bin, cut);
  const verdict = frameExactVerdict(cutFrames, 29.7);
  record.truncatedMaster = { bytesKept: Math.floor(bytes.length * 0.6), bytesWhole: bytes.length, goodFrames, goodIntegrity, cutIntegrity, cutFrames, verdict };
  expect(cutIntegrity.exit !== 0 || cutIntegrity.errors !== '').toBe(true);
  expect(verdict.ok).toBe(false);
  if (!verdict.ok) expect(['count_mismatch', 'unreadable']).toContain(verdict.reason);
});
