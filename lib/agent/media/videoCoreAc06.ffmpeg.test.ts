/** @jest-environment node */
/**
 * Video Core v1.0 AC-06 as ONE fixture on the REAL bundled ffmpeg, offline (network, storage and database faked as in
 * ./mediaStudio.ffmpeg.test.ts): five clips + the music from 0:59 + 29.7 s + 9:16 + a Georgian end text, measured on
 * the delivered files, not on the plan. The product does it as the chain it is — the montage lane makes the 29.7 s
 * vertical cut on the track from 0:59 (the five clips, each seen), then the edit lane lays the Georgian text over the
 * last three seconds of THAT result (the parent kept) — so the fixture runs both steps and measures the final file:
 *   - 891 decoded frames (29.7 s × 30 fps, the frame grid of lib/video/durationContract) after the montage AND after
 *     the edit (an edit never changes the length);
 *   - the frame is portrait (9:16), asked in the words only;
 *   - the track is heard from its 0:59.000 at the first frame (a marker tone at 0:59–0:59.4 of the track), and still
 *     playing in the last second;
 *   - all five clips are in the master (the QC's source manifest names five, each with its seconds), none left out;
 *   - the Georgian text is absent before its last three seconds and drawn at the end, in the box the layer QC measured.
 * VIDEO_CORE_AC06_OUT=<file> records the measured numbers (docs/handoffs/video-core/evidence).
 */
jest.mock('server-only', () => ({}));
jest.mock('./montageLive', () => ({ audit: async () => {}, quoteKey: () => 'k', every: () => () => {} }));
jest.mock('../../security/callerMedia', () => ({ resolveCallerMedia: async () => ({ ok: false, reason: 'unreadable' }) }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => null }));

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
import { framesFor } from '../../video/durationContract';
import { enqueueMontageJob, quoteMontage, type MontageExecDeps } from './montageExec';
import { workMontageJob } from './montageWorker';
import type { AudioTiming, SourceContribution } from './montageAsk';
import { editViewOf, enqueueEditJob, quoteEdit, type EditExecDeps, type EditJobView } from './editExec';
import { renderEdit } from './editLive';
import { validateEditRequest } from './editPlan';
import { workEditJob } from './editWorker';
import { missingGlyphs } from './layerRender';
import type { LayerQcRecord } from './layerQc';
import type { Rect, TextLayer } from './layers';

jest.setTimeout(900_000);
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
  dir = mkdtempSync(join(tmpdir(), 'video-core-ac06-'));
  mockOut = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function montageDeps(store: ReturnType<typeof memoryLeaseStore>): MontageExecDeps {
  let ids = 0;
  return {
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
    newId: () => `ac06-montage-${ids++}`,
    every: () => () => {},
  };
}

function editDeps(store: ReturnType<typeof memoryLeaseStore>): EditExecDeps {
  let ids = 0;
  return {
    resolveFile: async (ref, userId) => {
      const file = mockFiles.get(ref.split('?')[0]!);
      return userId === 'u' && file ? { ok: true, url: file } : { ok: false, reason: 'not_yours' };
    },
    probe: (url) => probeMedia(url),
    render: (url, request, opts) => renderEdit(url, request, opts),
    upload: async (jobId, bytes, output, variant) => {
      const path = `renders/edits/${jobId}${variant === 'clean' ? '-clean' : ''}.${output}`;
      const file = join(dir, path.replace(/\//g, '_'));
      writeFileSync(file, bytes);
      const url = `https://media.test/${path}`;
      mockFiles.set(url, file);
      return `${url}?token=t`;
    },
    missingGlyphs: (texts) => missingGlyphs(texts.join(' ')),
    resign: async (u) => u,
    store,
    audit: async () => {},
    key: () => 'k',
    now: () => Date.now(),
    newId: () => `ac06-edit-${ids++}`,
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
const frameCount = (path: string): number => centreColours(path).length;

/** Mean loudness (dBFS) of the sound from `fromSec` for `forSec`, decoded from the start (exact). */
function meanDb(path: string, fromSec: number, forSec: number): number {
  const r = spawnSync(bin, ['-hide_banner', '-i', path, '-map', '0:a:0', '-af', `atrim=start=${fromSec}:duration=${forSec},volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr);
  if (!m) throw new Error(`volumedetect: ${r.stderr.slice(-400)}`);
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

/** One frame as RGB at `w`×`h`. */
function rgb(file: string, t: number, w: number, h: number): Buffer {
  return execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
}
/** Mean absolute difference of two frames inside a box (0–255). */
function diffIn(a: Buffer, b: Buffer, fw: number, r: Rect): number {
  let sum = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) {
    const i = (y * fw + x) * 3;
    sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    n += 3;
  }
  return Math.round((sum / n) * 100) / 100;
}

const KICKS = (fromSec: number) => `0.9*sin(2*PI*55*t)*exp(-30*mod(t-${fromSec}+10,0.5))*gte(t,${fromSec})`;
/** A 2:10 track: silence, then at exactly 0:59 a 1 kHz marker for 0.4 s, then 120 BPM kicks to the end. */
const TRACK = (sec: number) => `aevalsrc='0.9*sin(2*PI*1000*t)*between(t,59,59.4)+${KICKS(59.5)}':s=44100:d=${sec}`;
const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
const FINAL_SEC = 29.7;
const MUSIC_FROM_SEC = 59;
const END_TEXT = 'გაიგე მეტი MyAvatar.ge';
const evidence: Record<string, unknown> = {};

test('AC-06: five clips + music from 0:59 + 29.7 s + 9:16 + a Georgian end text — one chain, measured on the final file', async () => {
  const palette: Array<[string, [number, number, number]]> = [
    ['red', [255, 0, 0]], ['lime', [0, 255, 0]], ['blue', [0, 0, 255]], ['yellow', [255, 255, 0]], ['magenta', [255, 0, 255]],
  ];
  // Five 12 s landscape clips (60 s of footage for a 29.7 s cut) and the track.
  const clips = palette.map(([name]) => make(`${name}.mp4`, ['-f', 'lavfi', '-i', `color=c=${name}:size=320x180:rate=30:duration=12`, ...enc]));
  const song = make('song130.m4a', ['-f', 'lavfi', '-i', TRACK(130), '-c:a', 'aac']);

  // ── step 1: the montage, asked in GG's words (length, music start and frame all from the sentence; the numbers are
  // also passed, as the chat does, and must agree) ──
  const store = memoryLeaseStore();
  const deps = montageDeps(store);
  const prompt = 'ამ ხუთი ვიდეოთი 29.7 წამიანი ვერტიკალური 9:16 კლიპი გააკეთე, სიმღერა 59-ე წამიდან დაიწყე';
  const q = await quoteMontage(deps, { userId: 'u', files: [...clips, song], prompt, targetSec: FINAL_SEC, musicFromSec: MUSIC_FROM_SEC });
  if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
  expect(q.quote).toMatchObject({ totalSec: FINAL_SEC, musicStartSec: MUSIC_FROM_SEC, clips: 5 });
  expect(q.request.aspect).toBe('9:16');
  // Nothing was left out: the signed request names every one of the five clips (no selection was asked, so none is reported).
  for (const c of clips) expect(q.request.shots.some((s) => s.url === c)).toBe(true);
  expect(q.quote.selection ?? null).toBeNull();

  const queued = await enqueueMontageJob(deps, { userId: 'u', request: q.request, token: q.token });
  if (!queued.ok) throw new Error(`run: ${queued.error} ${queued.message}`);
  const r = await workMontageJob(deps, { jobId: queued.jobId, worker: 'w-ac06' });
  if (r.ran !== true || r.outcome !== 'delivered') throw new Error(`work: ${JSON.stringify(r)} ${store.rows.get(queued.jobId)?.error ?? ''}`);
  const montageFile = local(r.videoUrl);
  const montage = await probeMedia(r.videoUrl);
  expect(montage).toMatchObject({ hasVideo: true, hasAudio: true, videoCodec: 'h264', audioCodec: 'aac' });
  expect(montage!.height).toBeGreaterThan(montage!.width); // 9:16
  expect(Math.round((montage!.height / montage!.width) * 100) / 100).toBe(Math.round((16 / 9) * 100) / 100);
  const montageFrames = frameCount(montageFile);
  expect(montageFrames).toBe(framesFor(FINAL_SEC)); // 891: 29.7 s on the 30 fps grid, to the frame
  const qc = (store.rows.get(queued.jobId)!.result as { qc: { outcome: string; sources: SourceContribution[]; audio: AudioTiming; av: { videoSec: number; audioSec: number } } }).qc;
  expect(qc.outcome).toBe('PASS');
  expect(qc.audio).toMatchObject({ sourceStartSec: MUSIC_FROM_SEC, timelineStartSec: 0, targetSec: FINAL_SEC, endPolicy: 'stop' });
  expect(Math.abs(qc.av.audioSec - FINAL_SEC)).toBeLessThan(0.1);
  // All five clips are in the master: the manifest names five, each with seconds of its own, and the master's frames
  // show every one of them.
  expect(qc.sources.map((s) => s.name).sort()).toEqual(palette.map(([n]) => `${n}.mp4`).sort());
  for (const s of qc.sources) expect(s.outputSec).toBeGreaterThan(0);
  expect(Math.abs(qc.sources.reduce((a, s) => a + s.outputSec, 0) - FINAL_SEC)).toBeLessThan(0.2);
  const seen = centreColours(montageFile).map((c) => {
    let best = '', bestD = Infinity;
    for (const [name, p] of palette) { const d = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]); if (d < bestD) { best = name; bestD = d; } }
    return best;
  });
  const framesOf = Object.fromEntries(palette.map(([n]) => [n, seen.filter((x) => x === n).length]));
  for (const [n] of palette) expect([n, framesOf[n]! > 0]).toEqual([n, true]);
  // The track's 0:59.0–0:59.4 marker is the master's first 0.4 s; 0:59.42–0:59.48 is silence; the first kick at 0.5 s;
  // and 0:59 + 29.7 s = 1:28.7 of a 2:10 track: the kicks are still there in the last second.
  const env = [...Array(30)].map((_, i) => meanDb(montageFile, i * 0.02, 0.02));
  const at = (sec: number) => env[Math.round(sec / 0.02)]!;
  expect(Math.min(...env.slice(0, 20))).toBeGreaterThan(-10);
  expect(Math.max(at(0.42), at(0.44), at(0.46))).toBeLessThan(-40);
  expect(at(0.5)).toBeGreaterThan(-15);
  expect(meanDb(montageFile, FINAL_SEC - 1, 0.9)).toBeGreaterThan(-35);

  // ── step 2: the Georgian end text, laid on the delivered montage over its last three seconds (the parent kept) ──
  const edits = editDeps(store);
  const eq = await quoteEdit(edits, { userId: 'u', file: r.videoUrl, edits: [{ op: 'layers', add: [{ kind: 'text', role: 'cta', text: END_TEXT, lastSec: 3 }] }] });
  if (!eq.ok) throw new Error(`edit quote: ${eq.error} ${eq.message} ${eq.detail ?? ''}`);
  const eQueued = await enqueueEditJob(edits, { userId: 'u', request: eq.request, token: eq.token });
  if (!eQueued.ok) throw new Error(`edit run: ${eQueued.error}`);
  const ew = await workEditJob(edits, { jobId: eq.quote.jobId, worker: 'w-ac06-edit' });
  const row = (await store.read(eq.quote.jobId))!;
  if (!ew.ran || ew.outcome !== 'delivered') throw new Error(`edit not delivered: ${JSON.stringify(ew)} ${row.error ?? ''}`);
  const view = editViewOf(row) as Extract<EditJobView, { status: 'completed' }>;
  const finalFile = local(view.url);
  const request = validateEditRequest((row.params._job as { request: unknown }).request)!;
  const text = (request.edits.find((e) => e.op === 'layers') as { layers?: TextLayer[] } | undefined)?.layers?.[0];
  expect(text).toMatchObject({ kind: 'text', role: 'cta', text: END_TEXT, startSec: Math.round((FINAL_SEC - 3) * 1000) / 1000, endSec: FINAL_SEC });
  const layerQc = row.result && (row.result as Record<string, unknown>).layerQc as LayerQcRecord;
  expect(layerQc.outcome).toBe('PASS');
  const check = layerQc.checks.find((c) => c.id === text!.id) ?? layerQc.checks[0]!;
  // The final file: the same length to the frame, the same portrait frame, the parent untouched.
  const finalFrames = frameCount(finalFile);
  expect(finalFrames).toBe(framesFor(FINAL_SEC));
  expect([view.width, view.height]).toEqual([montage!.width, montage!.height]);
  expect(frameCount(montageFile)).toBe(montageFrames);
  const W = view.width, H = view.height;
  const before = diffIn(rgb(finalFile, FINAL_SEC - 3.3, W, H), rgb(montageFile, FINAL_SEC - 3.3, W, H), W, check.box);
  const drawn = diffIn(rgb(finalFile, FINAL_SEC - 0.3, W, H), rgb(montageFile, FINAL_SEC - 0.3, W, H), W, check.box);
  expect(before).toBeLessThan(3);
  expect(drawn).toBeGreaterThan(8);

  evidence.ac06 = {
    ask: { prompt, targetSec: FINAL_SEC, musicFromSec: MUSIC_FROM_SEC, clips: 5, aspect: q.request.aspect, endText: END_TEXT, endTextLastSec: 3 },
    montage: { frames: montageFrames, expectedFrames: framesFor(FINAL_SEC), durationSec: montage!.durationSec, width: montage!.width, height: montage!.height, audio: qc.audio, avAudioSec: qc.av.audioSec, sources: qc.sources.map((s) => [s.name, s.outputSec]), framesPerClip: framesOf, markerEnvelopeDb: env.slice(0, 26).map((d, i) => [Number((i * 0.02).toFixed(2)), d]), lastSecondDb: meanDb(montageFile, FINAL_SEC - 1, 0.9) },
    endText: { layer: text, box: check.box, absentBeforeDiff: before, drawnAtEndDiff: drawn, finalFrames, width: W, height: H, parentFramesAfter: frameCount(montageFile), layerQc: layerQc.outcome },
  };
});

afterAll(() => {
  if (process.env.VIDEO_CORE_AC06_OUT) writeFileSync(process.env.VIDEO_CORE_AC06_OUT, JSON.stringify(evidence, null, 1));
});
