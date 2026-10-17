/** @jest-environment node */
/**
 * padVoiceTail + laySyncedVoice — the talking avatar after sync.so (GG, 2026-10-17 12:29Z), with the REAL ffmpeg-static on
 * generated media. The line keeps its natural length and only gains a short silent tail (where the mouth closes); the
 * delivered file is sync.so's picture with OUR line as its only sound, as long as the line, hosted at the fixed path.
 */
jest.mock('server-only', () => ({}));

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

const run = promisify(execFile);
const BIN = ffmpegStatic as unknown as string;
const SYNCED_URL = 'https://cdn.sync.so/generations/out.mp4';
const VOICE_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/avatar-veo/id/voice.mp3?token=a';
const TAILED_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/avatar-veo/id/line-tail.wav?token=b';
const local: Record<string, string> = {};
const hosted: { bucket: string; path: string; buf: Buffer; type: string }[] = [];

// ffmpeg reads the local files in place of the downloads (the download guard is lib/video/ffmpegExec's own tests).
jest.mock('./ffmpegExec', () => ({
  ffmpegExec: (bin: string, args: string[], opts: unknown) => {
    const { execFile: ef } = jest.requireActual('node:child_process');
    const { promisify: p } = jest.requireActual('node:util');
    return p(ef)(bin, args.map((a: string) => local[a] ?? a), opts);
  },
}));
jest.mock('../orchestrator/storage-adapter', () => ({
  uploadBufferAndSign: jest.fn(async (bucket: string, path: string, buf: Buffer, type: string) => { hosted.push({ bucket, path, buf, type }); return `https://signed.test/${path}`; }),
}));
jest.mock('../agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn() }));
jest.mock('./modelLock', () => ({ VIDEO_PRIMARY: 'test' }));
jest.mock('../utils/withRetry', () => ({ withRetry: jest.fn() }));
jest.mock('../pipeline/compositing/ffmpeg-overlay', () => ({ applyMarketingOverlays: jest.fn() }));
jest.mock('../jobs/stallDetector', () => ({ StallDetector: class {} }));
jest.mock('../orchestrator/idempotency', () => ({ isProviderTripped: jest.fn(), recordProviderResult: jest.fn() }));

// eslint-disable-next-line import/first
import { laySyncedVoice, padVoiceTail } from './remixOps';

let dir: string;

/** Duration and stream kinds of a file, from ffmpeg's own header read. */
async function probe(file: string): Promise<{ seconds: number; video: boolean; aac: boolean; pcm: boolean; audios: number }> {
  const log = await run(BIN, ['-hide_banner', '-i', file]).then(() => '', (e: { stderr?: string }) => String(e.stderr ?? ''));
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
  return {
    seconds: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN,
    video: /Video: h264/.test(log),
    aac: /Audio: aac/.test(log),
    pcm: /Audio: pcm_s16le/.test(log),
    audios: (log.match(/Stream #\d+:\d+[^\n]*: Audio:/g) ?? []).length,
  };
}

async function hostedFile(i: number, ext: string): Promise<string> {
  const out = join(dir, `hosted-${i}-${Date.now()}.${ext}`);
  await writeFile(out, hosted[i]!.buf);
  return out;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'avatar-synced-test-'));
  // sync.so's output: the line's length (3.3 s) with a track of its own, which the delivered file must not carry.
  local[SYNCED_URL] = join(dir, 'synced.mp4');
  await run(BIN, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=25:duration=3.3',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3.3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', local[SYNCED_URL]!]);
  // The ElevenLabs line: 2.7 s.
  local[VOICE_URL] = join(dir, 'voice.mp3');
  await run(BIN, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=2.7', '-b:a', '128k', local[VOICE_URL]!]);
}, 60_000);
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
beforeEach(() => { hosted.length = 0; });

test('the line gains only its silent tail: 2.7 s + 0.6 s, as mono WAV, hosted at the path it is given', async () => {
  const url = await padVoiceTail(VOICE_URL, 0.6, { bucket: 'renders', path: 'avatar-veo/id/line-tail.wav' });
  expect(url).toBe('https://signed.test/avatar-veo/id/line-tail.wav');
  expect(hosted[0]).toMatchObject({ bucket: 'renders', path: 'avatar-veo/id/line-tail.wav', type: 'audio/wav' });
  const p = await probe(await hostedFile(0, 'wav'));
  expect(p.pcm).toBe(true);
  // An mp3 carries its own few ms of encoder padding; the line is never stretched, so 3.3 s ± that.
  expect(p.seconds).toBeGreaterThan(3.25);
  expect(p.seconds).toBeLessThan(3.42);
}, 60_000);

test('the delivered avatar: sync.so\'s picture, OUR line as its only sound, the line\'s length, at the fixed path', async () => {
  const tail = await padVoiceTail(VOICE_URL, 0.6, { bucket: 'renders', path: 'avatar-veo/id/line-tail.wav' });
  local[TAILED_URL] = await hostedFile(0, 'wav');
  expect(tail).not.toBeNull();
  hosted.length = 0;
  const url = await laySyncedVoice(SYNCED_URL, TAILED_URL, { bucket: 'renders', path: 'avatar-veo/id/voiced.mp4' });
  expect(url).toBe('https://signed.test/avatar-veo/id/voiced.mp4');
  expect(hosted[0]).toMatchObject({ bucket: 'renders', path: 'avatar-veo/id/voiced.mp4', type: 'video/mp4' });
  const file = await hostedFile(0, 'mp4');
  const p = await probe(file);
  expect(p.video && p.aac).toBe(true);
  expect(p.audios).toBe(1);
  expect(p.seconds).toBeGreaterThan(3.2);
  expect(p.seconds).toBeLessThan(3.45);
  // The sound is our 220 Hz line, not sync.so's 1 kHz track: its loudest band sits low.
  const { stderr } = await run(BIN, ['-hide_banner', '-i', file, '-map', '0:a:0', '-af', 'highpass=f=600,volumedetect', '-f', 'null', '-'])
    .catch((e: { stderr?: string }) => ({ stderr: String(e.stderr ?? '') }));
  const max = Number(/max_volume: (-?[\d.]+) dB/.exec(String(stderr))?.[1]);
  expect(max).toBeLessThan(-20);
}, 60_000);

test('nothing to work on → null, nothing hosted', async () => {
  expect(await padVoiceTail(VOICE_URL, 0, { bucket: 'renders', path: 'x.wav' })).toBeNull();
  expect(await padVoiceTail('', 0.6, { bucket: 'renders', path: 'x.wav' })).toBeNull();
  expect(await laySyncedVoice('', TAILED_URL, { bucket: 'renders', path: 'x.mp4' })).toBeNull();
  expect(await laySyncedVoice(SYNCED_URL, '', { bucket: 'renders', path: 'x.mp4' })).toBeNull();
  expect(hosted).toHaveLength(0);
});
