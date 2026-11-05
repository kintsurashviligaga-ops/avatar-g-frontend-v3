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

test('GG 2026-11-05 17:29Z: presenter, intro and logo scene sent in that order → intro first, presenter with a split screen, logo last', async () => {
  // GG's three files: the presenter (green, his voice), a short intro (yellow) and a logo end scene (magenta), uploaded
  // presenter first. His words name no roles and no file; the thinking step (stubbed here) watched them and decided.
  const tone = (name: string, c: string, sec: number, f: number) => {
    const out = join(dir, name);
    ff(['-f', 'lavfi', '-i', `color=${c}:s=720x1280:r=30:d=${sec}`, '-f', 'lavfi', '-i', `sine=f=${f}:d=${sec}:sample_rate=48000`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
    return out;
  };
  const P = file('gemini_generated_video.mp4', tone('presenter3.mp4', '0x30a030', 8, 300));
  const I = file('intro.mov', tone('intro3.mp4', 'yellow', 2, 500));
  const L = file('logo_final.mov', tone('logo3.mp4', 'magenta', 2, 700));
  const red = color('red3.mp4', 'red', 5);
  mockFiles.set('https://videos.pexels.com/video-files/9/red.mp4', red);
  const words = 'დაამონტაჟე და ეკრანი შუაში უნდა იყოს გაყოფილი რომ წამყვანმა ქვევით ილაპარაკოს და ზედა ეკრანზე რეალური ფაქტობრივი და მიზნობრივი ვიდეო გაუშვი.';
  const seen: Array<{ words: string; files: number[] }> = [];
  const store = memoryLeaseStore();
  const d = deps(store, {
    direct: async ({ words: w, videos }) => {
      seen.push({ words: w, files: videos.map((v) => v.file) });
      return { ok: true, decision: {
        files: [
          { file: 0, kind: 'presenter', summary: 'წამყვანი სტუდიაში ლაპარაკობს' },
          { file: 1, kind: 'intro', summary: 'არხის გახსნის ანიმაცია' },
          { file: 2, kind: 'logo', summary: 'ლოგოს ფინალური სცენა' },
        ],
        roles: { intro: 1, body: 0, outro: 2 }, splitScreen: true, speaker: 0,
        reasoning: ['ინტროს ვიდეოს ვსვამ დასაწყისში, მერე წამყვანს, ბოლოს ლოგოს სცენას.'],
        filled: ['თანმიმდევრობა არ გითქვამს: ინტრო პირველია, ლოგო ბოლოს.'],
        model: 'stub',
      } };
    },
    spotCutaways: async () => ({ ok: true, model: 'stub', lines: [
      { startSec: 0.2, endSec: 1.0, text: 'გამარჯობა', visual: false, query: '', prompt: '' },
      { startSec: 1.5, endSec: 5.5, text: 'ხელოვნური ინტელექტი საავადმყოფოებში', visual: true, query: 'hospital ai technology', prompt: '' },
    ] }),
    searchStock: async () => ({ url: 'https://videos.pexels.com/video-files/9/red.mp4', durationSec: 5, width: 1280, height: 720, pageUrl: 'https://www.pexels.com/video/9/', author: 'Author 9', source: 'pexels', id: 9 }),
  });
  const q = await quoteMontage(d, { userId: 'u', files: [P, I, L], names: ['gemini_generated_video.mp4', 'intro.mov', 'logo_final.mov'], prompt: words, aspect: '9:16' });
  if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
  expect(seen).toEqual([{ words, files: [0, 1, 2] }]);
  expect(q.quote.cutting).toBe('assembly');
  expect(q.quote.assembly!.parts.map((p) => [p.role, p.file])).toEqual([['intro', 1], ['body', 0], ['outro', 2]]);
  expect(q.quote.cutaways?.speakerFile).toBe(0);
  const ins = q.request.inserts!;
  expect(ins).toHaveLength(1);
  // The presenter starts after the 2 s intro: his line at 1.5–5.5 s is at ~3.5–7.5 s of the edit.
  expect(ins[0]!.startSec).toBeGreaterThanOrEqual(3.4);
  const text = quoteText(q.quote, ['gemini_generated_video.mp4', 'intro.mov', 'logo_final.mov'], 'ka');
  expect(text).toMatch(/^🧠 რა დავინახე და რა გადავწყვიტე:\n· ვიდეო 1 — წამყვანი: წამყვანი სტუდიაში ლაპარაკობს/);
  expect(text).toMatch(/ეს არ გითქვამს, ამიტომ მე გადავწყვიტე:\n· თანმიმდევრობა არ გითქვამს/);
  expect(text).toMatch(/ინტრო \(ვიდეო 2\): .*ძირითადი \(ვიდეო 1\): .*აუტრო \(ვიდეო 3\)/);
  expect(text).toMatch(/გაყოფილი ეკრანი: ზემოთ 1 რეალური კადრი \(Pexels\)/);

  const queued = await enqueueMontageJob(d, { userId: 'u', request: q.request, token: q.token });
  if (!queued.ok) throw new Error(`run: ${queued.error} ${queued.message}`);
  const r = await workMontageJob(d, { jobId: queued.jobId, worker: 'w-gg' });
  if (r.ran !== true || r.outcome !== 'delivered') throw new Error(`work: ${JSON.stringify(r)} ${store.rows.get(queued.jobId)?.error ?? ''}`);
  const master = mockFiles.get(r.videoUrl.split('?')[0]!)!;
  const full = '720:1280:0:0', top = '720:600:0:0', bottom = '720:600:0:680';
  const isYellow = ([r, g, b]: number[]) => r! > 180 && g! > 180 && b! < 80;
  const isMagenta = ([r, g, b]: number[]) => r! > 180 && b! > 180 && g! < 80;
  const isRed = ([r, g, b]: number[]) => r! > 180 && g! < 60 && b! < 60;
  const isGreen = ([r, g, b]: number[]) => g! > 120 && r! < 90 && b! < 90;
  expect(isYellow(mean(master, 0.5, full))).toBe(true);
  expect(isGreen(mean(master, 2.6, full))).toBe(true);
  const mid = (ins[0]!.startSec + ins[0]!.endSec) / 2;
  expect(isRed(mean(master, mid, top))).toBe(true);
  expect(isGreen(mean(master, mid, bottom))).toBe(true);
  expect(isMagenta(mean(master, q.quote.totalSec - 0.4, full))).toBe(true);
  const sd = await streamDurations(r.videoUrl);
  expect(Math.abs(sd!.audioSec! - sd!.videoSec!)).toBeLessThanOrEqual(0.05);
});

test('no stock for a line: a generated Veo shot is priced, laid, and one Veo could not make is paid back', async () => {
  const spk = join(dir, 'speaker4.mp4');
  ff(['-f', 'lavfi', '-i', 'color=0x30a030:s=720x1280:r=30:d=8', '-f', 'lavfi', '-i', 'sine=f=300:d=8:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', spk]);
  const S = file('speaker4.mp4', spk);
  const veo = color('veo-red.mp4', 'red', 4);
  mockFiles.set('https://media.test/montage/veo/a.mp4', veo);
  const prompts: string[] = [];
  const reserved: number[] = [];
  const refunds: number[] = [];
  const store = memoryLeaseStore();
  const d = deps(store, {
    spotCutaways: async () => ({ ok: true, model: 'stub', lines: [
      { startSec: 0.5, endSec: 3.5, text: 'მზის სისტემა', visual: true, query: 'solar system orbit', prompt: 'Planets orbiting the sun in deep space.' },
      { startSec: 4.5, endSec: 7.5, text: 'ოკეანის სიღრმე', visual: true, query: 'deep ocean trench', prompt: 'A dark deep ocean trench, light rays.' },
    ] }),
    searchStock: async () => null,
    veoAvailable: () => true,
    billing: {
      reserve: async (_u, c) => { reserved.push(c); return { proceed: true, charged: true, reason: 'ok' }; },
      refund: async (_u, _r, c) => { refunds.push(c); return 'refunded'; },
    },
    render: (req, o) => runMontage(req, {
      jobId: o.jobId, signal: o.signal, onStage: async (step, pct) => o.onStage(step, pct),
      makeCutaway: async (p) => { prompts.push(p); return prompts.length === 1 ? 'https://media.test/montage/veo/a.mp4' : null; },
    }),
  });
  const q = await quoteMontage(d, { userId: 'u', files: [S], prompt: 'split screen with real footage', aspect: '9:16' });
  if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
  expect(q.request.inserts!.map((x) => x.source)).toEqual(['veo', 'veo']);
  expect(q.quote.credits).toBe(66);
  expect(quoteText(q.quote, ['speaker4.mp4'], 'ka')).toMatch(/ზემოთ 2 შექმნილი კადრი \(Veo, თითო ✦ 33\)/);
  const queued = await enqueueMontageJob(d, { userId: 'u', request: q.request, token: q.token });
  if (!queued.ok) throw new Error(`run: ${queued.error} ${queued.message}`);
  expect(reserved).toEqual([66]);
  const r = await workMontageJob(d, { jobId: queued.jobId, worker: 'w-veo' });
  if (r.ran !== true || r.outcome !== 'delivered') throw new Error(`work: ${JSON.stringify(r)} ${store.rows.get(queued.jobId)?.error ?? ''}`);
  expect(prompts).toEqual(['Planets orbiting the sun in deep space.', 'A dark deep ocean trench, light rays.']);
  expect(refunds).toEqual([33]);
  const master = mockFiles.get(r.videoUrl.split('?')[0]!)!;
  const ins = q.request.inserts!;
  const isRed = ([r, g, b]: number[]) => r! > 180 && g! < 60 && b! < 60;
  const isGreen = ([r, g, b]: number[]) => g! > 120 && r! < 90 && b! < 90;
  expect(isRed(mean(master, (ins[0]!.startSec + ins[0]!.endSec) / 2, '720:600:0:0'))).toBe(true);
  // The shot Veo did not make: the speaker stays full screen there.
  expect(isGreen(mean(master, (ins[1]!.startSec + ins[1]!.endSec) / 2, '720:600:0:0'))).toBe(true);
});
