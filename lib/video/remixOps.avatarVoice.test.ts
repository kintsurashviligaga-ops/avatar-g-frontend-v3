/** @jest-environment node */
/**
 * muxVoiceOntoClip — the talking avatar's ElevenLabs line over its silent 8 s Veo clip (GG, 2026-10-17 07:54Z), with the
 * REAL ffmpeg-static on generated media: the picture decides the length (a 3 s line is padded, never the clip cut to
 * 3 s; a longer line ends with the clip), and the result is hosted at the fixed path it is given.
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
const CLIP_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/genjutsu/u/clip.mp4?token=v';
const VOICE_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/avatar-veo/id/voice.mp3?token=a';
const local: Record<string, string> = {};
const hosted: { bucket: string; path: string; buf: Buffer }[] = [];

// ffmpeg reads the local files in place of the downloads (the download guard is lib/video/ffmpegExec's own tests).
jest.mock('./ffmpegExec', () => ({
  ffmpegExec: (bin: string, args: string[], opts: unknown) => {
    const { execFile: ef } = jest.requireActual('node:child_process');
    const { promisify: p } = jest.requireActual('node:util');
    return p(ef)(bin, args.map((a: string) => local[a] ?? a), opts);
  },
}));
jest.mock('../orchestrator/storage-adapter', () => ({
  uploadBufferAndSign: jest.fn(async (bucket: string, path: string, buf: Buffer) => { hosted.push({ bucket, path, buf }); return `https://signed.test/${path}`; }),
}));
jest.mock('../agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn() }));
jest.mock('./modelLock', () => ({ VIDEO_PRIMARY: 'test' }));
jest.mock('../utils/withRetry', () => ({ withRetry: jest.fn() }));
jest.mock('../pipeline/compositing/ffmpeg-overlay', () => ({ applyMarketingOverlays: jest.fn() }));
jest.mock('../jobs/stallDetector', () => ({ StallDetector: class {} }));
jest.mock('../orchestrator/idempotency', () => ({ isProviderTripped: jest.fn(), recordProviderResult: jest.fn() }));

// eslint-disable-next-line import/first
import { muxVoiceOntoClip } from './remixOps';

let dir: string;

/** Duration and stream kinds of a file, from ffmpeg's own header read. */
async function probe(file: string): Promise<{ seconds: number; video: boolean; audio: boolean }> {
  const log = await run(BIN, ['-hide_banner', '-i', file]).then(() => '', (e: { stderr?: string }) => String(e.stderr ?? ''));
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
  return { seconds: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN, video: /Video: h264/.test(log), audio: /Audio: aac/.test(log) };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'avatar-voice-test-'));
  local[CLIP_URL] = join(dir, 'clip.mp4');
  await run(BIN, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=24:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', local[CLIP_URL]!]);
}, 60_000);
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
beforeEach(() => { hosted.length = 0; });

async function line(seconds: number): Promise<void> {
  local[VOICE_URL] = join(dir, `voice-${seconds}.mp3`);
  await run(BIN, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${seconds}`, '-b:a', '128k', local[VOICE_URL]!]);
}

async function hostedFile(): Promise<string> {
  const out = join(dir, `out-${Date.now()}.mp4`);
  await writeFile(out, hosted[0]!.buf);
  return out;
}

test('a 3 s line under the 8 s clip: the clip keeps its 8 s and its picture, the line is its only sound, hosted at the fixed path', async () => {
  await line(3);
  const url = await muxVoiceOntoClip(CLIP_URL, VOICE_URL, 8, { bucket: 'renders', path: 'avatar-veo/id/voiced.mp4' });
  expect(url).toBe('https://signed.test/avatar-veo/id/voiced.mp4');
  expect(hosted).toHaveLength(1);
  expect(hosted[0]).toMatchObject({ bucket: 'renders', path: 'avatar-veo/id/voiced.mp4' });
  const p = await probe(await hostedFile());
  expect(p.video && p.audio).toBe(true);
  expect(p.seconds).toBeGreaterThan(7.9);
  expect(p.seconds).toBeLessThan(8.1);
}, 60_000);

test('a line a little longer than the clip ends with the clip', async () => {
  await line(9);
  await muxVoiceOntoClip(CLIP_URL, VOICE_URL, 8, { bucket: 'renders', path: 'avatar-veo/id/voiced.mp4' });
  expect((await probe(await hostedFile())).seconds).toBeLessThan(8.1);
}, 60_000);

test('nothing to lay or no length → null, nothing hosted', async () => {
  expect(await muxVoiceOntoClip(CLIP_URL, '', 8, { bucket: 'renders', path: 'x.mp4' })).toBeNull();
  expect(await muxVoiceOntoClip(CLIP_URL, VOICE_URL, 0, { bucket: 'renders', path: 'x.mp4' })).toBeNull();
  expect(hosted).toHaveLength(0);
});
