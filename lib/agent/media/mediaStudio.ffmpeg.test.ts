/** @jest-environment node */
/**
 * Agent G Media Studio v2.0 on the REAL bundled ffmpeg, offline (the network, storage and database faked as in
 * ./montageExec.ffmpeg.test.ts). These are the spec's own cases, measured on the delivered master, not on the plan:
 *   - E2E-22 „მარტო ბოლო ხუთი": the two clips left out put ZERO frames in the master, and every kept clip fills
 *     exactly the seconds the QC's source-contribution manifest says it does (counted frame by frame);
 *   - E2E-23 the owner's 0:58 + 70 s: a master of 70 s to the frame (2100 frames at 30 fps), the track heard from
 *     its 0:58.000 at the master's first frame (a marker tone that starts at 0:58 and stops at 0:58.4), and still
 *     playing at the end (0:58 + 70 s = 2:08 of a 2:10 track);
 *   - the same ask with a 2:00 track is refused at the quote, with nothing rendered.
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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { analyzeTrack, grabFrames, probeMedia, streamDurations } from '../../services/montage/beatAnalysis';
import { withFfmpegSignal } from '../../video/ffmpegExec';
import { runMontage } from '../../services/montage/montagePipeline';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { enqueueMontageJob, quoteMontage, type MontageExecDeps } from './montageExec';
import { workMontageJob } from './montageWorker';
import type { AudioTiming, SourceContribution } from './montageAsk';

jest.setTimeout(600_000);
const bin = ffmpegStatic as unknown as string;
let dir = '';

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  mockFiles.set(`https://media.test/in/${name}`, out);
  return `https://media.test/in/${name}`;
}
const local = (url: string) => mockFiles.get(url.split('?')[0]!)!;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'media-studio-'));
  mockOut = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function liveLike(store: ReturnType<typeof memoryLeaseStore>, renders: string[]): MontageExecDeps {
  let ids = 0;
  return {
    resolveFile: async (ref) => ({ ok: true, url: ref }),
    probe: (url) => probeMedia(url),
    analyzeTrack: (url) => analyzeTrack(url),
    render: (req, o) => {
      renders.push(o.jobId);
      return runMontage(req, { jobId: o.jobId, signal: o.signal, onStage: o.onStage });
    },
    grabFrames: (url, timesSec, o) => withFfmpegSignal(o.signal, () => grabFrames(url, timesSec, { size: o.size, ...(o.fit ? { fit: o.fit } : {}) })),
    streamDurations: (url, o) => withFfmpegSignal(o?.signal, () => streamDurations(url)),
    store,
    billing: { reserve: async () => ({ proceed: true, charged: false, reason: 'ok' }), refund: async () => 'nothing' },
    audit: async () => {},
    key: () => 'test-key',
    now: () => Date.now(),
    newId: () => `studio-job-${ids++}`,
    every: () => () => {},
  };
}

/** Every video frame of a file, as the mean colour of its centre (a quarter of each side), in order. */
function centreColours(path: string): Array<[number, number, number]> {
  const raw = execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-i', path, '-map', '0:v:0', '-vf', 'crop=iw/4:ih/4,scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i + 2 < raw.length; i += 3) out.push([raw[i]!, raw[i + 1]!, raw[i + 2]!]);
  return out;
}

/** The video frames a file really has (decoded, not the container's claim). */
function frameCount(path: string): number {
  return centreColours(path).length;
}

/** Mean loudness (dBFS) of the master's sound from `fromSec` for `forSec`, decoded from the start (exact). */
function meanDb(path: string, fromSec: number, forSec: number): number {
  const r = spawnSync(bin, ['-hide_banner', '-i', path, '-map', '0:a:0', '-af', `atrim=start=${fromSec}:duration=${forSec},volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr);
  if (!m) throw new Error(`volumedetect: ${r.stderr.slice(-400)}`);
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

const KICKS = (fromSec: number) => `0.9*sin(2*PI*55*t)*exp(-30*mod(t-${fromSec}+10,0.5))*gte(t,${fromSec})`;
const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];

describe('E2E-22: „მარტო ბოლო ხუთი" — the clips left out are not in the master, frame by frame', () => {
  test('seven coloured clips + a track: the first two contribute zero frames, the rest exactly their manifest seconds', async () => {
    const palette: Array<[string, [number, number, number]]> = [
      ['red', [255, 0, 0]], ['lime', [0, 255, 0]], // left out
      ['blue', [0, 0, 255]], ['yellow', [255, 255, 0]], ['magenta', [255, 0, 255]], ['cyan', [0, 255, 255]], ['white', [255, 255, 255]],
    ];
    const clips = palette.map(([name]) => make(`${name}.mp4`, ['-f', 'lavfi', '-i', `color=c=${name}:size=320x180:rate=30:duration=4`, ...enc]));
    const song = make('song22.m4a', ['-f', 'lavfi', '-i', `aevalsrc='${KICKS(0.25)}':s=44100:d=20`, '-c:a', 'aac']);
    const store = memoryLeaseStore();
    const renders: string[] = [];
    const deps = liveLike(store, renders);

    const q = await quoteMontage(deps, { userId: 'u', files: [...clips, song], prompt: 'მარტო ბოლო ხუთი გამოიყენე', targetSec: 10 });
    if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
    // Numbers are files as sent (the track is file 8): kept are clips 3–7 and the track.
    expect(q.quote.selection).toMatchObject({ sent: 8, used: [2, 3, 4, 5, 6, 7], excluded: [0, 1], excludedNames: ['red.mp4', 'lime.mp4'] });
    expect(q.quote.clips).toBe(5);
    expect(q.quote.totalSec).toBe(10);
    // The signed request does not even name the clips left out.
    expect(q.request.shots.some((s) => s.url === clips[0] || s.url === clips[1])).toBe(false);

    const queued = await enqueueMontageJob(deps, { userId: 'u', request: q.request, token: q.token });
    if (!queued.ok) throw new Error(`run: ${queued.error} ${queued.message}`);
    const r = await workMontageJob(deps, { jobId: queued.jobId, worker: 'w-22' });
    if (r.ran !== true || r.outcome !== 'delivered') throw new Error(`work: ${JSON.stringify(r)} ${store.rows.get(queued.jobId)?.error ?? ''}`);
    const qc = (store.rows.get(queued.jobId)!.result as { qc: { outcome: string; sources: SourceContribution[]; audio: AudioTiming } }).qc;
    expect(qc.outcome).toBe('PASS');

    // Every frame of the master, named by the nearest colour of the palette.
    const frames = centreColours(local(r.videoUrl)).map((c) => {
      let best = '', bestD = Infinity;
      for (const [name, p] of palette) {
        const d = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]);
        if (d < bestD) { best = name; bestD = d; }
      }
      return { name: best, d: bestD };
    });
    expect(frames).toHaveLength(300); // 10 s at 30 fps
    expect(frames.every((f) => f.d < 40)).toBe(true); // every frame is one of the clips, cleanly
    const count = (name: string) => frames.filter((f) => f.name === name).length;
    expect([count('red'), count('lime')]).toEqual([0, 0]);
    // The provenance manifest names the kept clips only, and what it says each fills is what the master shows.
    expect(qc.sources.map((s) => s.name)).toEqual(['blue.mp4', 'yellow.mp4', 'magenta.mp4', 'cyan.mp4', 'white.mp4']);
    for (const s of qc.sources) {
      const seen = count(s.name.replace('.mp4', ''));
      expect([s.name, Math.abs(seen - Math.round(s.outputSec * 30)) <= 1]).toEqual([s.name, true]);
    }
    evidence.e2e22 = { selection: q.quote.selection, frames: Object.fromEntries(palette.map(([n]) => [n, count(n)])), sources: qc.sources.map((s) => [s.name, s.outputSec]) };
  });
});

describe('E2E-23: the owner’s 0:58 + 70 s', () => {
  // A 2:10 track: silence, then at exactly 0:58 a 1 kHz marker for 0.4 s, then 120 BPM kicks to the end.
  const TRACK = (sec: number) => `aevalsrc='0.9*sin(2*PI*1000*t)*between(t,58,58.4)+${KICKS(58.5)}':s=44100:d=${sec}`;
  const clipsFor = (tag: string) => ['testsrc', 'testsrc2', 'smptebars', 'rgbtestsrc'].map((src, i) =>
    make(`${tag}${i}.mp4`, ['-f', 'lavfi', '-i', `${src}=size=320x180:rate=30:duration=20`, ...enc]));

  test('70 s to the frame, the track heard from its 0:58.000 at the first frame, and still playing at the end', async () => {
    const clips = clipsFor('o');
    const song = make('song130.m4a', ['-f', 'lavfi', '-i', TRACK(130), '-c:a', 'aac']);
    const store = memoryLeaseStore();
    const renders: string[] = [];
    const deps = liveLike(store, renders);
    // GG's own sentence: the length, the start and the rest of the ask all come from the words.
    const prompt = 'ამ ვიდეოებით ჯამში 70 წამი გააკეთე, სიმღერა 58-ე წამიდან დაიწყე';
    const q = await quoteMontage(deps, { userId: 'u', files: [...clips, song], prompt, targetSec: 70, musicFromSec: 58 });
    if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
    expect(q.quote).toMatchObject({ totalSec: 70, musicStartSec: 58 });

    const queued = await enqueueMontageJob(deps, { userId: 'u', request: q.request, token: q.token });
    if (!queued.ok) throw new Error(`run: ${queued.error} ${queued.message}`);
    const r = await workMontageJob(deps, { jobId: queued.jobId, worker: 'w-23' });
    if (r.ran !== true || r.outcome !== 'delivered') throw new Error(`work: ${JSON.stringify(r)} ${store.rows.get(queued.jobId)?.error ?? ''}`);
    const file = local(r.videoUrl);
    const master = await probeMedia(r.videoUrl);
    expect(master).toMatchObject({ hasVideo: true, hasAudio: true, videoCodec: 'h264', audioCodec: 'aac' });
    expect(frameCount(file)).toBe(2100); // 70 s × 30 fps, to the frame
    const qc = (store.rows.get(queued.jobId)!.result as { qc: { outcome: string; audio: AudioTiming; av: { videoSec: number; audioSec: number } } }).qc;
    expect(qc.outcome).toBe('PASS');
    expect(qc.audio).toMatchObject({ sourceStartSec: 58, timelineStartSec: 0, targetSec: 70, endPolicy: 'stop', sourceAudio: 'remove' });
    expect(Math.abs(qc.av.audioSec - 70)).toBeLessThan(0.1);
    // The track's 0:58.0–0:58.4 marker must be the master's first 0.4 s, read in 20 ms windows: loud from the very
    // first window to 0.38 s, silent from 0.42 s, and the first kick (0:58.5) at 0.5 s. A start moved by even one
    // window (to a beat, or by an encoder delay) breaks one of the three.
    const env = [...Array(30)].map((_, i) => meanDb(file, i * 0.02, 0.02));
    const at = (sec: number) => env[Math.round(sec / 0.02)]!;
    const marker = env.slice(0, 20); // 0.00–0.40
    expect(Math.min(...marker)).toBeGreaterThan(-10); // a 0.9 sine (-3.9 dBFS mono; about -7 in the stereo master)
    expect(Math.max(at(0.42), at(0.44), at(0.46))).toBeLessThan(-40); // 0:58.42–0:58.48 of the track is silence
    expect(at(0.5)).toBeGreaterThan(-15); // the kick at 0:58.5
    // 0:58 + 70 s = 2:08: the kicks are still there in the master's last second.
    expect(meanDb(file, 69, 0.9)).toBeGreaterThan(-35);
    evidence.e2e23 = { frames: 2100, durationSec: master!.durationSec, audio: qc.audio, envelopeDb: env.map((d, i) => [Number((i * 0.02).toFixed(2)), d]) };
  });

  test('the same ask with a 2:00 track is refused at the quote: never looped, never shortened, nothing rendered', async () => {
    const clips = clipsFor('s');
    const song = make('song120.m4a', ['-f', 'lavfi', '-i', TRACK(120), '-c:a', 'aac']);
    const store = memoryLeaseStore();
    const renders: string[] = [];
    const deps = liveLike(store, renders);
    const q = await quoteMontage(deps, { userId: 'u', files: [...clips, song], targetSec: 70, musicFromSec: 58 });
    expect(q).toMatchObject({ ok: false, error: 'music_too_short', detail: { fromSec: 58, targetSec: 70 } });
    expect(renders).toEqual([]);
    expect(store.rows.size).toBe(0);
    evidence.e2e23short = q.ok ? null : { error: q.error, detail: q.detail };
  });
});

const evidence: Record<string, unknown> = {};
afterAll(() => {
  // MEDIA_STUDIO_E2E_OUT=<file> records the measured numbers as the evidence of docs/agent-g-media/03-E2E-EVIDENCE.md.
  if (process.env.MEDIA_STUDIO_E2E_OUT) writeFileSync(process.env.MEDIA_STUDIO_E2E_OUT, JSON.stringify(evidence, null, 1));
});
