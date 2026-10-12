/** @jest-environment node */
/**
 * Transitions between a montage's shots (GG 2026-10-11 17:38Z: „ქაფქათს და სხვა ფუნქციებს რაც აკლია"), on the REAL
 * bundled ffmpeg, offline (network, storage and database faked as in ./soundMontage.ffmpeg.test.ts). Each case goes
 * quote → queue → worker → QC → stored file, and the delivered file is then measured frame by frame by this test:
 *
 *   T1 „cut these to the music with zoom transitions": short clips a hard-cut edit would use up leave each shot's
 *      roll free, so every boundary gets its transition and every cut stays on its beat;
 *   T2 no music, „მდოვრე გადასვლებით": nothing to pay the overlaps with, so the edit is shorter by exactly them, and the
 *      middle of each one is the two clips' mix;
 *   T3 photos, „different transitions": a different style at each boundary, the photos' own length kept;
 *   T4 „0.4 წამიანი გადასვლები ჩაბნელებით და ფლეშით": through black, then through white, each 0.4 s.
 *
 * Every clip is one flat colour with a small moving test pattern in its middle (for the clip QC), so the colour of a
 * whole frame says which clip it is, and a blend is a colour neither clip has. TRANSITIONS_DIR=<dir> keeps the masters
 * and the measured numbers.
 */
jest.mock('server-only', () => ({}));

const mockFiles = new Map<string, string>();
jest.mock('../../web/publicFetch', () => {
  const { copyFile, stat } = jest.requireActual('node:fs/promises');
  return {
    MEDIA_TYPES: /.*/,
    fetchPublicToFile: async (url: string, path: string) => {
      const src = mockFiles.get(url.split('?')[0]!);
      if (!src) return { ok: false, error: 'fetch_failed' };
      await copyFile(src, path);
      return { ok: true, bytes: (await stat(path)).size, contentType: 'video/mp4' };
    },
  };
});
let mockOut = '';
jest.mock('../../orchestrator/storage-adapter', () => {
  const { writeFileSync } = jest.requireActual('node:fs');
  const { join } = jest.requireActual('node:path');
  const host = (path: string, buf: Buffer) => {
    const local = join(mockOut, path.replace(/\//g, '_'));
    writeFileSync(local, buf);
    const url = `https://media.test/${path}`;
    mockFiles.set(url, local);
    return `${url}?token=t`;
  };
  return {
    uploadBufferAndSign: async (_b: string, path: string, buf: Buffer) => host(path, buf),
    uploadAndSign: async (_b: string, path: string, b64: string) => host(path, Buffer.from(b64, 'base64')),
    reSignIfInternal: async (url: string) => url,
  };
});
jest.mock('../../orchestrator/jobs', () => ({ updateJobStage: async () => {} }));
jest.mock('../optimizer/activeConfig', () => ({ getActiveConfig: async () => null }));
jest.mock('../../observability/report-error', () => ({ reportError: () => {} }));
jest.mock('./montageLive', () => ({ audit: async () => {}, quoteKey: () => 'k', every: () => () => {} }));
jest.mock('../../security/callerMedia', () => ({ resolveCallerMedia: async () => ({ ok: false, reason: 'unreadable' }) }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => null }));

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { analyzeTrack, grabFrames, probeMedia, streamDurations } from '../../services/montage/beatAnalysis';
import { runMontage } from '../../services/montage/montagePipeline';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { withFfmpegSignal } from '../../video/ffmpegExec';
import { beatMontageAsk, quoteText, type AttachmentKind } from './montageChat';
import { enqueueMontageJob, quoteMontage, type MontageExecDeps, type MontageQuote } from './montageExec';
import { outputTimeline, transitionAsk, type AudioTiming } from './montageAsk';
import type { AgentMontageRequest } from '@/lib/services/montage/montagePlan';
import { workMontageJob } from './montageWorker';

jest.setTimeout(900_000);
const bin = ffmpegStatic as unknown as string;
const OUT = process.env.TRANSITIONS_DIR ?? '';
const FPS = 30;
let dir = '';
const evidence: Record<string, unknown> = {};

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  mockFiles.set(`https://media.test/in/${name}`, out);
  return `https://media.test/in/${name}`;
}
const local = (url: string) => mockFiles.get(url.split('?')[0]!)!;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'transitions-'));
  mockOut = dir;
  if (OUT) mkdirSync(OUT, { recursive: true });
});
afterAll(() => {
  if (OUT) writeFileSync(join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 1));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const store = memoryLeaseStore(() => Date.now());
let ids = 0;
const deps: MontageExecDeps = {
  resolveFile: async (ref) => ({ ok: true, url: ref }),
  probe: (url) => probeMedia(url),
  analyzeTrack: (url) => analyzeTrack(url),
  render: (req, o) => runMontage(req, { jobId: o.jobId, signal: o.signal, onStage: o.onStage }),
  grabFrames: (url, timesSec, o) => withFfmpegSignal(o.signal, () => grabFrames(url, timesSec, { size: o.size, ...(o.fit ? { fit: o.fit } : {}) })),
  streamDurations: (url, o) => withFfmpegSignal(o?.signal, () => streamDurations(url)),
  store,
  billing: { reserve: async () => ({ proceed: true, charged: false, reason: 'ok' }), refund: async () => 'nothing' },
  audit: async () => {},
  key: () => 'test-key',
  now: () => Date.now(),
  newId: () => `transition-job-${ids++}`,
  every: () => () => {},
};

type Rgb = [number, number, number];
interface Made { quote: MontageQuote; request: AgentMontageRequest; master: string; qc: { outcome: string; audio: AudioTiming }; frames: Rgb[] }

/** Every frame's mean colour: the whole picture averaged to one pixel. */
function frameColours(path: string): Rgb[] {
  const raw = execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-i', path, '-vf', 'scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  const out: Rgb[] = [];
  for (let i = 0; i + 2 < raw.length; i += 3) out.push([raw[i]!, raw[i + 1]!, raw[i + 2]!]);
  return out;
}
const at = (frames: readonly Rgb[], t: number): Rgb => frames[Math.min(frames.length - 1, Math.max(0, Math.round(t * FPS)))]!;
const dist = (a: Rgb, b: Rgb) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The chat claims the message, then quote → queue → worker → QC → the stored master, measured frame by frame. */
async function montage(label: string, prompt: string, files: string[], kinds: AttachmentKind[]): Promise<Made> {
  expect([label, beatMontageAsk(prompt, kinds)]).toEqual([label, true]);
  const q = await quoteMontage(deps, { userId: 'u1', files, prompt });
  if (!q.ok) throw new Error(`${label}: refused ${q.error} ${q.message}`);
  const queued = await enqueueMontageJob(deps, { userId: 'u1', request: q.request, token: q.token });
  if (!queued.ok) throw new Error(`${label}: not queued ${queued.error}`);
  const w = await workMontageJob(deps, { jobId: queued.jobId, worker: 'w' });
  if (w.ran !== true || w.outcome !== 'delivered') throw new Error(`${label}: ${JSON.stringify(w)} ${store.rows.get(queued.jobId)?.error ?? ''}`);
  const master = local(w.videoUrl);
  const qc = (store.rows.get(queued.jobId)!.result as { qc: Made['qc'] }).qc;
  if (OUT) copyFileSync(master, join(OUT, `${label}.mp4`));
  const frames = frameColours(master);
  evidence[label] = {
    prompt, card: quoteText(q.quote, undefined, 'ka'), cardEn: quoteText(q.quote, undefined, 'en'),
    quote: { totalSec: q.quote.totalSec, shots: q.quote.shots, cutting: q.quote.cutting, transitions: q.quote.transitions ?? null },
    qc: { outcome: qc.outcome }, masterFrames: frames.length, masterSec: r3(frames.length / FPS),
  };
  return { quote: q.quote, request: q.request, master, qc, frames };
}

/**
 * Each transition in the master, measured: the last frame before it (the outgoing shot alone), its middle, the first
 * frame after it (the incoming shot alone), and its darkest and brightest frames. The timeline is the signed request's
 * own (the overlap of shot k is the stretch where shot k has started and shot k-1 has not ended).
 */
interface Boundary { shot: number; style: string; sec: number; startSec: number; endSec: number; before: Rgb; mid: Rgb; after: Rgb; darkest: Rgb; brightest: Rgb; sameClip: boolean }
const sum = (c: Rgb) => c[0] + c[1] + c[2];
function boundaries(m: Made): Boundary[] {
  const tl = outputTimeline(m.request.shots);
  return m.request.shots.flatMap((s, k) => {
    if (k === 0 || !s.transition || s.transition === 'cut') return [];
    const start = tl[k]!.outStartSec, end = tl[k - 1]!.outEndSec;
    const inside = m.frames.slice(Math.round(start * FPS), Math.round(end * FPS) + 1);
    return [{
      shot: k, style: s.transition, sec: r3(end - start), startSec: start, endSec: end,
      before: at(m.frames, start - 2 / FPS), mid: at(m.frames, (start + end) / 2), after: at(m.frames, end + 2 / FPS),
      darkest: inside.reduce((a, b) => (sum(b) < sum(a) ? b : a)), brightest: inside.reduce((a, b) => (sum(b) > sum(a) ? b : a)),
      sameClip: tl[k]!.source === tl[k - 1]!.source,
    }];
  });
}

// The inputs: three portrait phone clips (6 s, their own sound), each one flat colour; three flat photos; a 30 s song
// of 120 BPM kicks (a beat every 0.5 s from 0:00).
const CLIP_COLOURS = ['c83228', '28b43c', '3246dc'] as const;
const PHOTO_COLOURS = ['dc8c1e', '8c28c8', '1eb4b4'] as const;
let clips: string[] = [];
let photos: string[] = [];
let song = '';

beforeAll(() => {
  clips = CLIP_COLOURS.map((hex, i) => make(`clip${i}.mp4`, [
    '-f', 'lavfi', '-i', `color=c=0x${hex}:size=360x640:rate=30:duration=6`,
    '-f', 'lavfi', '-i', 'testsrc2=size=120x120:rate=30:duration=6',
    '-f', 'lavfi', '-i', `sine=frequency=${440 + 220 * i}:sample_rate=44100:duration=6`,
    '-filter_complex', '[0:v][1:v]overlay=120:260:shortest=1,format=yuv420p[v];[2:a]volume=0.5,aformat=channel_layouts=stereo[a]',
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest',
  ]));
  photos = PHOTO_COLOURS.map((hex, i) => make(`photo${i}.jpg`, ['-f', 'lavfi', '-i', `color=c=0x${hex}:size=640x800:d=1`, '-frames:v', '1', '-q:v', '2']));
  song = make('song.m4a', ['-f', 'lavfi', '-i', "aevalsrc='0.9*sin(2*PI*55*t)*exp(-30*mod(t,0.5))':s=44100:d=30", '-c:a', 'aac']);
});

/** A blend: the middle of the transition is a picture neither shot shows alone. */
function expectBlend(b: Boundary): void {
  expect([b.shot, b.style, dist(b.mid, b.before) > 30 && dist(b.mid, b.after) > 30]).toEqual([b.shot, b.style, true]);
}

test('T1 · on the beat, „zoom transitions": short clips leave room for every one, and every cut stays on its beat', async () => {
  const words = 'cut these to the music with zoom transitions';
  expect(transitionAsk(words)).toEqual({ styles: ['zoom'] });
  const files = [...clips, song];
  const kinds: AttachmentKind[] = ['video', 'video', 'video', 'audio'];
  // The same edit with hard cuts uses up these short clips: without a roll kept free, no transition would fit.
  const plain = await quoteMontage(deps, { userId: 'u1', files, prompt: 'cut these to the music' });
  if (!plain.ok) throw new Error(`plain refused: ${plain.error}`);

  const m = await montage('T1-beat-zoom', words, files, kinds);
  expect(m.quote.cutting).toBe('beat');
  expect(m.qc.outcome).toBe('PASS');
  const t = m.quote.transitions!;
  expect(t).toMatchObject({ styles: ['zoom'], noFootage: 0, tooShort: 0, shortenedSec: 0 });
  expect(t.applied).toBe(t.boundaries);
  expect(t.applied).toBeGreaterThan(1);
  // The master is as long as the card says, to the frame.
  expect(Math.abs(m.frames.length - Math.round(m.quote.totalSec * FPS))).toBeLessThanOrEqual(1);
  const bs = boundaries(m);
  expect(bs).toHaveLength(t.applied);
  // Every transition ends where its hard cut is: on the beat (the master starts on the first beat; 0.5 s a beat).
  const offBeat = (x: number) => Math.abs(x / 0.5 - Math.round(x / 0.5)) * 0.5;
  const onBeat = bs.map((b) => ({ shot: b.shot, startSec: b.startSec, endSec: b.endSec, off: r3(Math.min(offBeat(b.startSec), offBeat(b.endSec))) }));
  for (const o of onBeat) expect([o, o.off <= 0.02]).toEqual([o, true]);
  for (const b of bs) expect([b.shot, b.sec]).toEqual([b.shot, 0.5]);
  // Every boundary between two clips is a blend of both.
  bs.filter((b) => !b.sameClip).forEach(expectBlend);
  expect(bs.filter((b) => !b.sameClip).length).toBeGreaterThanOrEqual(2);
  (evidence['T1-beat-zoom'] as Record<string, unknown>).boundaries = bs;
  (evidence['T1-beat-zoom'] as Record<string, unknown>).onBeat = onBeat;
  (evidence['T1-beat-zoom'] as Record<string, unknown>).hardCutEdit = { totalSec: plain.quote.totalSec, shots: plain.quote.shots };
});

test('T2 · no music, „მდოვრე გადასვლებით": shorter by exactly the overlaps, each one the two clips’ mix', async () => {
  const words = 'დაამონტაჟე ეს ვიდეოები, მდოვრე გადასვლებით';
  expect(transitionAsk(words)).toEqual({ styles: ['crossfade'] });
  const m = await montage('T2-no-music-crossfade', words, clips, ['video', 'video', 'video']);
  expect(m.quote).toMatchObject({ cutting: 'whole', shots: 3 });
  expect(m.quote.transitions).toMatchObject({ styles: ['crossfade'], boundaries: 2, applied: 2, shortenedSec: 1 });
  expect(m.qc.outcome).toBe('PASS');
  // The three clips whole (each 6 s less the tail guard), less the two half-second overlaps.
  const whole = m.request.shots.reduce((s, x) => s + (x.endSec - x.startSec), 0);
  expect(m.quote.totalSec).toBeCloseTo(whole - 1, 2);
  expect(Math.abs(m.frames.length - Math.round(m.quote.totalSec * FPS))).toBeLessThanOrEqual(1);
  const bs = boundaries(m);
  expect(bs.map((b) => [b.style, b.sec])).toEqual([['crossfade', 0.5], ['crossfade', 0.5]]);
  for (const b of bs) {
    expectBlend(b);
    // A dissolve's middle is the two colours half and half.
    const half: Rgb = [0, 1, 2].map((c) => (b.before[c]! + b.after[c]!) / 2) as Rgb;
    expect([b.shot, dist(b.mid, half) < 36]).toEqual([b.shot, true]);
  }
  (evidence['T2-no-music-crossfade'] as Record<string, unknown>).boundaries = bs;
});

test('T3 · photos, „different transitions": a different style at each boundary, the photos’ own 3 s kept', async () => {
  const words = 'make a slideshow with different transitions';
  expect(transitionAsk(words)).toMatchObject({ mixed: true });
  const m = await montage('T3-photos-mixed', words, photos, ['image', 'image', 'image']);
  expect(m.quote).toMatchObject({ stills: 3, totalSec: 9 });
  expect(m.quote.transitions).toMatchObject({ mixed: true, boundaries: 2, applied: 2, shortenedSec: 0 });
  expect(m.qc.outcome).toBe('PASS');
  expect(Math.abs(m.frames.length - 9 * FPS)).toBeLessThanOrEqual(1);
  const bs = boundaries(m);
  expect(bs.map((b) => b.style)).toEqual(['crossfade', 'slide']);
  bs.forEach(expectBlend);
  // Each photo whole on screen in its own stretch, in order.
  const seen = [1, 4.5, 8].map((s) => at(m.frames, s));
  PHOTO_COLOURS.forEach((hex, i) => {
    const want = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16)) as Rgb;
    expect([i, dist(seen[i]!, want) < 60]).toEqual([i, true]);
  });
  (evidence['T3-photos-mixed'] as Record<string, unknown>).boundaries = bs;
  (evidence['T3-photos-mixed'] as Record<string, unknown>).photos = seen;
});

test('T4 · „0.4 წამიანი გადასვლები ჩაბნელებით და ფლეშით": through black, then through white, 0.4 s each', async () => {
  const words = 'დაამონტაჟე მუსიკაზე, 0.4 წამიანი გადასვლები ჩაბნელებით და ფლეშით';
  expect(transitionAsk(words)).toEqual({ styles: ['fade', 'flash'], sec: 0.4 });
  const m = await montage('T4-black-white', words, [...clips, song], ['video', 'video', 'video', 'audio']);
  expect(m.qc.outcome).toBe('PASS');
  expect(m.quote.transitions).toMatchObject({ styles: ['fade', 'flash'], sec: 0.4 });
  expect(Math.abs(m.frames.length - Math.round(m.quote.totalSec * FPS))).toBeLessThanOrEqual(1);
  const bs = boundaries(m);
  (evidence['T4-black-white'] as Record<string, unknown>).boundaries = bs;
  expect(bs.length).toBeGreaterThanOrEqual(2);
  bs.forEach((b, i) => {
    expect(b.style).toBe(i % 2 === 0 ? 'fade' : 'flash');
    expect(b.sec).toBeCloseTo(0.4, 2);
    // Through black: its darkest frame is black; through white: its brightest is white.
    if (b.style === 'fade') expect([b.shot, b.darkest.every((c) => c < 24)]).toEqual([b.shot, true]);
    else expect([b.shot, b.brightest.every((c) => c > 230)]).toEqual([b.shot, true]);
  });
});
