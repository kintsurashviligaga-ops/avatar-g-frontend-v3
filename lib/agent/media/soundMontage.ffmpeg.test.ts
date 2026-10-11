/** @jest-environment node */
/**
 * GG 2026-10-11 17:38Z, on the REAL bundled ffmpeg, offline (network, storage and database faked as in
 * ./ownerMontage.ffmpeg.test.ts): „თუ მუსიკა არ ავტვირთე ისე ვიდეოს დამონტაჟებას არ იწყებს … ვიდეოში რომ იყოს თავისი
 * ხმაც და ზემოდან მუსიკა დაედოს ან ნარაცია … სურათის მონტაჟსაც არ აკეთებს". Each case goes quote → queue → worker →
 * QC → stored file, and the delivered file is then measured by this test's own reads, not by the plan:
 *
 *   S1 no music sent: the clips joined whole, in order, each heard with its OWN sound (a 440 Hz clip, then a 1 kHz one);
 *   S2 photos alone, no music: each photo 3 s, in order, its own colour on the screen;
 *   S3 „თავისი ხმაც და ზემოდან მუსიკა": each clip's own sound at its own level, the track beneath it 10 dB down;
 *   S4 a narration the user recorded over it: heard on top, and the rest steps back while it speaks;
 *   S5 photos and a narration only: the photos stretch to hold all of it.
 *
 * Every sound is a pure tone in its own band (clips 440 Hz / 1 kHz, music 150 Hz, narration 3 kHz), so each lane's
 * level is read from the master on its own. SOUND_MONTAGE_DIR=<dir> keeps the masters and the measured numbers.
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

import { execFileSync, spawnSync } from 'node:child_process';
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
import type { AudioTiming, SourceContribution } from './montageAsk';
import { workMontageJob } from './montageWorker';

jest.setTimeout(900_000);
const bin = ffmpegStatic as unknown as string;
const OUT = process.env.SOUND_MONTAGE_DIR ?? '';
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
  dir = mkdtempSync(join(tmpdir(), 'sound-montage-'));
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
  newId: () => `sound-job-${ids++}`,
  every: () => () => {},
};

interface Made { quote: MontageQuote; master: string; qc: { outcome: string; sources: SourceContribution[]; audio: AudioTiming }; sec: number }

/** The chat claims the message, then quote → queue → worker → QC → the stored master. */
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
  const sec = (await probeMedia(w.videoUrl))!.durationSec;
  if (OUT) copyFileSync(master, join(OUT, `${label}.mp4`));
  evidence[label] = { prompt, card: quoteText(q.quote, undefined, 'ka'), quote: { sound: q.quote.sound, cutting: q.quote.cutting, totalSec: q.quote.totalSec, shots: q.quote.shots, voice: q.quote.voice ?? null, musicEndsSec: q.quote.musicEndsSec ?? null }, qc: { outcome: qc.outcome, audio: qc.audio }, masterSec: sec };
  return { quote: q.quote, master, qc, sec };
}

/** The level (dBFS, mean) of one tone's band in `path` from `fromSec` for `forSec`: two narrow band-passes, then volumedetect. */
function bandDb(path: string, hz: number, fromSec: number, forSec: number): number {
  const band = `bandpass=f=${hz}:width_type=q:width=12,bandpass=f=${hz}:width_type=q:width=12`;
  const r = spawnSync(bin, ['-hide_banner', '-i', path, '-map', '0:a:0', '-af', `atrim=start=${fromSec}:duration=${forSec},asetpts=PTS-STARTPTS,${band},volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr);
  if (!m) throw new Error(`volumedetect: ${r.stderr.slice(-400)}`);
  return m[1] === '-inf' ? -120 : Number(m[1]);
}

/** The centre pixel's colour at `t` (RGB). */
function centre(path: string, t: number): [number, number, number] {
  const raw = execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', path, '-frames:v', '1', '-vf', 'crop=8:8:(iw-8)/2:(ih-8)/2,scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return [raw[0]!, raw[1]!, raw[2]!];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

// The inputs: two portrait phone clips with their own (stereo, as a phone records) sound, three flat photos, a stereo
// song, a narration (a phone's voice memo is mono: it is laid over both channels).
let clipA = '', clipB = '', song = '', voice = '', voiceLong = '';
const photos: string[] = [];
const COLOURS = { red: [220, 30, 30], green: [30, 200, 60], blue: [40, 60, 220] } as const;

beforeAll(() => {
  const clip = (name: string, hz: number, sec: number) => make(name, [
    '-f', 'lavfi', '-i', `testsrc2=size=360x640:rate=30:duration=${sec}`,
    '-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=44100:duration=${sec}`,
    '-af', 'volume=0.5', '-ac', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
  ]);
  clipA = clip('clipA.mp4', 440, 4);
  clipB = clip('clipB.mp4', 1000, 3);
  for (const [name, [r, g, b]] of Object.entries(COLOURS)) {
    const hex = [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
    photos.push(make(`${name}.jpg`, ['-f', 'lavfi', '-i', `color=c=0x${hex}:size=640x800:d=1`, '-frames:v', '1', '-q:v', '2']));
  }
  song = make('song.m4a', ['-f', 'lavfi', '-i', 'sine=frequency=150:sample_rate=44100:duration=30', '-af', 'volume=0.5', '-ac', '2', '-c:a', 'aac']);
  // The narration speaks from 1.5 s to 3.5 s of its 6 s (silence around it), named as a recording.
  voice = make('my-voice.m4a', ['-f', 'lavfi', '-i', "aevalsrc='0.5*sin(2*PI*3000*t)*between(t,1.5,3.5)':s=44100:d=6", '-c:a', 'aac']);
  voiceLong = make('narration.m4a', ['-f', 'lavfi', '-i', "aevalsrc='0.5*sin(2*PI*3000*t)':s=44100:d=12", '-c:a', 'aac']);
});

test('S1 · no music sent: the clips joined whole, in order, each with its own sound', async () => {
  const m = await montage('S1-no-music', 'დაამონტაჟე ეს ვიდეოები', [clipA, clipB], ['video', 'video']);
  expect(m.quote).toMatchObject({ sound: 'own', cutting: 'whole', musicFile: null, shots: 2 });
  expect(m.qc.outcome).toBe('PASS');
  expect(m.qc.audio).toMatchObject({ sourceAudio: 'preserve', replacementAudio: 'none' });
  // Both clips nearly whole: 4 + 3 s less the last frames never read.
  expect(m.sec).toBeGreaterThan(6.7);
  expect(m.sec).toBeLessThan(7.1);
  const cut = m.qc.sources[1]!.windows[0]!.outStartSec;
  const a = { a440: bandDb(m.master, 440, 0.5, cut - 1), a1k: bandDb(m.master, 1000, 0.5, cut - 1) };
  const b = { b440: bandDb(m.master, 440, cut + 0.5, 2), b1k: bandDb(m.master, 1000, cut + 0.5, 2) };
  const src = { a440: bandDb(local(clipA), 440, 0.5, 2.5), b1k: bandDb(local(clipB), 1000, 0.5, 2) };
  (evidence['S1-no-music'] as Record<string, unknown>).bands = { cutAtSec: cut, ...a, ...b, sourceA440: src.a440, sourceB1k: src.b1k };
  // Clip A's own 440 Hz in its stretch, clip B's own 1 kHz in its: each at least 25 dB over the other, and each at the
  // level it was recorded at.
  expect(a.a440 - a.a1k).toBeGreaterThan(25);
  expect(b.b1k - b.b440).toBeGreaterThan(25);
  expect(Math.abs(a.a440 - src.a440)).toBeLessThan(1.5);
  expect(Math.abs(b.b1k - src.b1k)).toBeLessThan(1.5);
});

test('S2 · photos alone, no music: each photo 3 s, in order, its own colour', async () => {
  const m = await montage('S2-photos', 'make a slideshow', photos, ['image', 'image', 'image']);
  expect(m.quote).toMatchObject({ clips: 0, stills: 3, sound: 'own', cutting: 'whole', totalSec: 9 });
  expect(m.qc.outcome).toBe('PASS');
  expect(m.sec).toBeCloseTo(9, 0);
  const seen = [1.5, 4.5, 7.5].map((t) => centre(m.master, t));
  (evidence['S2-photos'] as Record<string, unknown>).centres = seen;
  Object.values(COLOURS).forEach((want, i) => {
    const got = seen[i]!;
    expect([i, got.every((c, k) => Math.abs(c - want[k]!) < 40)]).toEqual([i, true]);
  });
});

test('S3 · „თავისი ხმაც და ზემოდან მუსიკა": each clip at its own level, the track 10 dB beneath it', async () => {
  const words = 'დაამონტაჟე, თავისი ხმაც დარჩეს და მუსიკა ზემოდან დაადე';
  const m = await montage('S3-own-and-music', words, [clipA, clipB, song], ['video', 'video', 'audio']);
  expect(m.quote).toMatchObject({ sound: 'own+music', cutting: 'whole', musicFile: 2 });
  expect(m.qc.outcome).toBe('PASS');
  expect(m.qc.audio).toMatchObject({ sourceAudio: 'preserve', replacementAudio: 'mix' });
  const clipLevel = bandDb(local(clipA), 440, 0.5, 2.5);
  const songLevel = bandDb(local(song), 150, 0.5, 2.5);
  const own = bandDb(m.master, 440, 0.5, 2.5);
  const bed = bandDb(m.master, 150, 0.5, 2.5);
  (evidence['S3-own-and-music'] as Record<string, unknown>).levels = { clipSourceDb: clipLevel, clipInMasterDb: own, songSourceDb: songLevel, songInMasterDb: bed };
  expect(Math.abs(own - clipLevel)).toBeLessThan(1.5);
  expect(bed - songLevel).toBeGreaterThan(-12);
  expect(bed - songLevel).toBeLessThan(-8);
});

test('S4 · a narration over it: heard on top, and the rest steps back while it speaks', async () => {
  const words = 'დაამონტაჟე, თავისი ხმაც დარჩეს, მუსიკაც დაადე და ზემოდან ჩემი ნარაცია';
  const m = await montage('S4-narration', words, [clipA, clipB, song, voice], ['video', 'video', 'audio', 'audio']);
  expect(m.quote).toMatchObject({ sound: 'own+music', musicFile: 2, voice: { file: 3, startSec: 0 } });
  expect(m.quote.voice?.cutSec).toBeUndefined();
  expect(m.qc.outcome).toBe('PASS');
  expect(m.qc.audio).toMatchObject({ voice: { timelineStartSec: 0 } });
  // Before it speaks (0.2–1.2 s) and while it speaks (2.0–3.2 s), both inside clip A.
  const before = { own: bandDb(m.master, 440, 0.2, 1), bed: bandDb(m.master, 150, 0.2, 1), voice: bandDb(m.master, 3000, 0.2, 1) };
  const during = { own: bandDb(m.master, 440, 2.0, 1.2), bed: bandDb(m.master, 150, 2.0, 1.2), voice: bandDb(m.master, 3000, 2.0, 1.2) };
  (evidence['S4-narration'] as Record<string, unknown>).levels = { before, during };
  expect(during.voice).toBeGreaterThan(-20);
  expect(before.voice).toBeLessThan(-45);
  // The clip's own sound and the music step back by at least 6 dB under the voice.
  expect(before.own - during.own).toBeGreaterThan(6);
  expect(before.bed - during.bed).toBeGreaterThan(6);
  // After it stops (5.0–6.0 s, in clip B) the bed is back up.
  const after = bandDb(m.master, 150, 5.0, 1);
  expect(after - during.bed).toBeGreaterThan(5);
});

test('S5 · photos and a narration only: the photos stretch to hold all of it', async () => {
  const m = await montage('S5-photos-narration', 'make a slideshow with my narration', [...photos, voiceLong], ['image', 'image', 'image', 'audio']);
  expect(m.quote).toMatchObject({ clips: 0, stills: 3, sound: 'own', musicFile: null, voice: { file: 3, durationSec: 12 }, totalSec: 12 });
  expect(m.qc.outcome).toBe('PASS');
  expect(m.sec).toBeCloseTo(12, 0);
  // The narration from the first second to the last.
  expect(bandDb(m.master, 3000, 0.3, 1)).toBeGreaterThan(-20);
  expect(bandDb(m.master, 3000, 10.6, 1)).toBeGreaterThan(-20);
  (evidence['S5-photos-narration'] as Record<string, unknown>).voiceDb = { start: r1(bandDb(m.master, 3000, 0.3, 1)), end: r1(bandDb(m.master, 3000, 10.6, 1)) };
});
