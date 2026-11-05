/** @jest-environment node */
/**
 * Cutaways in a split screen on the REAL bundled ffmpeg, end to end but offline (GG 2026-11-05 14:32Z): a speaker's
 * clip, his lines (the Gemini read is stubbed), two stock clips (the Pexels search is stubbed with local files on its
 * host) → the quote → the queue → the worker → the QC. Pins: the footage is in the TOP half exactly in the planned
 * windows, the speaker is in the bottom half there and full screen elsewhere, a cyan line divides them, the sound is
 * the speaker's untouched and as long as the picture, the per-clip QC still passes, and the card says what went where.

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

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { analyzeTrack, detectSegments, grabFrames, probeMedia, streamDurations } from '../../services/montage/beatAnalysis';
import { withFfmpegSignal } from '../../video/ffmpegExec';
import { runMontage } from '../../services/montage/montagePipeline';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { enqueueMontageJob, quoteMontage, type MontageExecDeps } from './montageExec';
import { workMontageJob } from './montageWorker';
import { quoteText } from './montageChat';

jest.setTimeout(240_000);
const bin = ffmpegStatic as unknown as string;
let dir = '';

const ff = (args: string[]) => execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
function file(name: string, path: string): string {
  mockFiles.set(`https://media.test/in/${name}`, path);
  return `https://media.test/in/${name}`;
}
/** The stderr of a null-muxer pass over a local file. */
const pass = (path: string, args: string[]) => spawnSync(bin, ['-hide_banner', '-nostats', '-i', path, ...args, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-assembly-'));
  mockOut = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function deps(store: ReturnType<typeof memoryLeaseStore>, extra: Partial<MontageExecDeps>): MontageExecDeps {
  let ids = 0;
  return {
    resolveFile: async (ref) => ({ ok: true, url: ref }),
    probe: (url) => probeMedia(url),
    analyzeTrack: (url) => analyzeTrack(url),
    detectSegments: (url, probe) => detectSegments(url, probe),
    render: (req, o) => runMontage(req, { jobId: o.jobId, signal: o.signal, onStage: async (step, pct) => o.onStage(step, pct) }),
    grabFrames: (url, timesSec, o) => withFfmpegSignal(o.signal, () => grabFrames(url, timesSec, { size: o.size, ...(o.fit ? { fit: o.fit } : {}) })),
    streamDurations: (url, o) => withFfmpegSignal(o?.signal, () => streamDurations(url)),
    store,
    billing: { reserve: async () => ({ proceed: true, charged: false, reason: 'ok' }), refund: async () => 'nothing' },
    audit: async () => {},
    key: () => 'test-key',
    now: () => Date.now(),
    newId: () => `cut-job-${ids++}`,
    every: () => () => {},
    ...extra,
  };
}

const color = (name: string, c: string, sec: number, size = '1280x720') => {
  const out = join(dir, name);
  ff(['-f', 'lavfi', '-i', `color=${c}:s=${size}:r=25:d=${sec}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out]);
  return out;
};

/** Mean of one channel of a region at time t of a local file, 0..255. */
function mean(path: string, t: number, crop: string): [number, number, number] {
  const buf = execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', path, '-frames:v', '1', '-vf', `crop=${crop},scale=8:8`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const s = [0, 0, 0];
  for (let i = 0; i < buf.length; i += 3) { s[0] += buf[i]!; s[1] += buf[i + 1]!; s[2] += buf[i + 2]!; }
  const n = buf.length / 3;
  return [s[0]! / n, s[1]! / n, s[2]! / n];
}

test('the speaker with two real shots over his lines: top half footage, bottom half him, his voice untouched', async () => {
  // The speaker: 9:16, green, a tone the whole time (his voice).
  const spk = join(dir, 'speaker.mp4');
  ff(['-f', 'lavfi', '-i', 'color=0x30a030:s=720x1280:r=30:d=8', '-f', 'lavfi', '-i', 'sine=f=300:d=8:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', spk]);
  const S = file('speaker.mp4', spk);
  const red = color('red.mp4', 'red', 5), blue = color('blue.mp4', 'blue', 5);
  mockFiles.set('https://videos.pexels.com/video-files/1/red.mp4', red);
  mockFiles.set('https://videos.pexels.com/video-files/2/blue.mp4', blue);
  const searches: string[] = [];
  const store = memoryLeaseStore();
  const d = deps(store, {
    spotCutaways: async () => ({ ok: true, model: 'stub', lines: [
      { startSec: 0, endSec: 1.0, text: 'გამარჯობა', visual: false, query: '', prompt: '' },
      { startSec: 1.0, endSec: 3.6, text: 'გალაქტიკები ქსელად ლაგდება', visual: true, query: 'cosmic web simulation', prompt: '' },
      { startSec: 3.7, endSec: 4.6, text: 'ეს ყველაფერი', visual: false, query: '', prompt: '' },
      { startSec: 4.6, endSec: 7.2, text: 'სუპერკომპიუტერი ამას ითვლის', visual: true, query: 'supercomputer data center', prompt: '' },
    ] }),
    searchStock: async (q) => {
      searches.push(q);
      const k = searches.length;
      return { url: `https://videos.pexels.com/video-files/${k}/${k === 1 ? 'red' : 'blue'}.mp4`, durationSec: 5, width: 1280, height: 720, pageUrl: `https://www.pexels.com/video/${k}/`, author: `Author ${k}`, source: 'pexels', id: k };
    },
  });
  const q = await quoteMontage(d, { userId: 'u', files: [S], prompt: 'ეკრანი გაყავი და რეალური კადრები ჩასვი', aspect: '9:16' });
  if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
  expect(searches).toEqual(['cosmic web simulation', 'supercomputer data center']);
  const ins = q.request.inserts!;
  expect(ins).toHaveLength(2);
  expect(ins[0]!.startSec).toBeGreaterThanOrEqual(1.1);
  expect(ins[0]!.endSec).toBeLessThanOrEqual(3.6);
  expect(ins[1]!.startSec).toBeGreaterThanOrEqual(ins[0]!.endSec + 0.6 - 1e-3);
  expect(ins[1]!.endSec).toBeLessThanOrEqual(7.0 + 1e-3);
  const text = quoteText(q.quote, ['speaker.mp4'], 'ka');
  expect(text).toMatch(/გაყოფილი ეკრანი: ზემოთ 2 რეალური კადრი \(Pexels\)/);
  expect(text).toMatch(/„cosmic web simulation“ — „გალაქტიკები ქსელად ლაგდება“ \(Author 1\)/);

  const queued = await enqueueMontageJob(d, { userId: 'u', request: q.request, token: q.token });
  if (!queued.ok) throw new Error(`run: ${queued.error} ${queued.message}`);
  const r = await workMontageJob(d, { jobId: queued.jobId, worker: 'w-cut' });
  if (r.ran !== true || r.outcome !== 'delivered') throw new Error(`work: ${JSON.stringify(r)} ${store.rows.get(queued.jobId)?.error ?? ''}`);
  const master = mockFiles.get(r.videoUrl.split('?')[0]!)!;

  const mid0 = (ins[0]!.startSec + ins[0]!.endSec) / 2, mid1 = (ins[1]!.startSec + ins[1]!.endSec) / 2;
  const top = '720:600:0:0', bottom = '720:600:0:680';
  const isRed = ([r, g, b]: number[]) => r! > 180 && g! < 60 && b! < 60;
  const isBlue = ([r, g, b]: number[]) => b! > 180 && r! < 60 && g! < 60;
  const isGreen = ([r, g, b]: number[]) => g! > 120 && r! < 90 && b! < 90;
  expect(isRed(mean(master, mid0, top))).toBe(true);
  expect(isGreen(mean(master, mid0, bottom))).toBe(true);
  expect(isBlue(mean(master, mid1, top))).toBe(true);
  // Outside the cutaways the speaker fills the frame.
  expect(isGreen(mean(master, 0.5, top))).toBe(true);
  expect(isGreen(mean(master, (ins[0]!.endSec + ins[1]!.startSec) / 2, top))).toBe(true);
  // The cyan divider in the middle during a cutaway.
  const [cr, cg, cb] = mean(master, mid0, '720:4:0:638');
  expect(cg > 150 && cb > 150 && cr < 120).toBe(true);
  // The sound is his, whole, as long as the picture.
  const sd = await streamDurations(r.videoUrl);
  // The picture keeps the stitched master's frames (the overlay adds none and drops none).
  expect(Math.abs(sd!.videoSec! - q.quote.totalSec)).toBeLessThanOrEqual(1 / 30 + 1e-3);
  expect(Math.abs(sd!.audioSec! - sd!.videoSec!)).toBeLessThanOrEqual(0.05);
  expect(pass(master, ['-vn', '-af', 'silencedetect=n=-30dB:d=0.2'])).not.toMatch(/silence_start/);
  const qc = (store.rows.get(queued.jobId)!.result as { qc: { ok: boolean } }).qc;
  expect(qc.ok).toBe(true);
});

test('cutaways asked but no stock found: the speaker stays full screen and the card says why', async () => {
  const spk = join(dir, 'speaker2.mp4');
  ff(['-f', 'lavfi', '-i', 'color=gray:s=720x1280:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=300:d=4:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', spk]);
  const S = file('speaker2.mp4', spk);
  const d = deps(memoryLeaseStore(), {
    spotCutaways: async () => ({ ok: true, model: 'stub', lines: [{ startSec: 0.5, endSec: 3.5, text: 'ქალაქი ღამით', visual: true, query: 'city at night', prompt: '' }] }),
    searchStock: async () => null,
  });
  const q = await quoteMontage(d, { userId: 'u', files: [S], prompt: 'add b-roll', aspect: '9:16' });
  if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
  expect(q.request.inserts).toBeUndefined();
  expect(q.quote.cutaways?.unavailable).toBe('nothing_found');
  expect(quoteText(q.quote, ['speaker2.mp4'], 'ka')).toMatch(/გაყოფილი ეკრანი: არა, შესაფერისი კადრი ვერ ვიპოვე/);
});
