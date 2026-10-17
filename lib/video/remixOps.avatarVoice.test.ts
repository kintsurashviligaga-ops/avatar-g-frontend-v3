/** @jest-environment node */
/**
 * muxVoiceOntoClip — the talking avatar's ElevenLabs line over its 8 s Veo clip (GG, 2026-10-17 07:54Z), with the
 * REAL ffmpeg-static on generated media: the picture decides the length (a 3 s line is padded, never the clip cut to
 * 3 s; a longer line ends with the clip), and the result is hosted at the fixed path it is given.
 *
 * GG, 10:15Z: "the lip sync does not match at all" — the line was laid from 0 s over a mouth Veo moved on its own. Since
 * the 10:22Z tap „Veo ლაპარაკობს" Veo says the line itself and the ElevenLabs line replaces its voice, each phrase on
 * the span where Veo's mouth said it (lib/avatar/speechMatch).
 */
jest.mock('server-only', () => ({}));

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

const run = promisify(execFile);
const BIN = ffmpegStatic as unknown as string;
const CLIP_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/genjutsu/u/clip.mp4?token=v';
const VOICE_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/avatar-veo/id/voice.mp3?token=a';
const SPOKEN_CLIP_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/genjutsu/u/spoken.mp4?token=w';
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
// eslint-disable-next-line import/first
import { frameLevelsDb, speechSpans } from '../avatar/speechMatch';

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
  // Veo's own voice: two phrases, 1.0–1.6 s and 2.0–3.2 s, over a quiet room.
  local[SPOKEN_CLIP_URL] = join(dir, 'spoken.mp4');
  await run(BIN, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=24:duration=8',
    '-f', 'lavfi', '-i', `aevalsrc='if(between(t,1.0,1.6)+between(t,2.0,3.2),0.5*sin(2*PI*300*t),0.0005*sin(2*PI*50*t))':s=48000:d=8`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', local[SPOKEN_CLIP_URL]!]);
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

/** Where the delivered file's sound speaks, read the way the dub reads it. */
async function spokenSpans(file: string): Promise<{ start: number; end: number }[]> {
  const pcmPath = `${file}.pcm`;
  await run(BIN, ['-y', '-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 's16le', pcmPath]);
  const buf = await readFile(pcmPath);
  return speechSpans(frameLevelsDb(new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2)), 16_000));
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

// GG's tap 2026-10-17 10:22Z „Veo ლაპარაკობს".
test('a clip where Veo spoke: Veo\'s voice is gone and each phrase of the line lands where Veo\'s mouth said it', async () => {
  // The ElevenLabs line: two phrases, 0.1–0.6 s and 0.8–1.9 s — earlier and shorter than Veo's.
  local[VOICE_URL] = join(dir, 'voice-two-phrases.mp3');
  await run(BIN, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='if(between(t,0.1,0.6)+between(t,0.8,1.9),0.5*sin(2*PI*220*t),0)':s=44100:d=2.2`, '-b:a', '128k', local[VOICE_URL]!]);
  const url = await muxVoiceOntoClip(SPOKEN_CLIP_URL, VOICE_URL, 8, { bucket: 'renders', path: 'avatar-veo/id/voiced.mp4' });
  expect(url).toBe('https://signed.test/avatar-veo/id/voiced.mp4');
  const file = await hostedFile();
  expect((await probe(file)).seconds).toBeGreaterThan(7.9);
  const spans = await spokenSpans(file);
  expect(spans).toHaveLength(2);
  // Veo's mouth spoke 1.0–1.6 and 2.0–3.2 (each span read with its 30 ms padding).
  expect(spans[0]!.start).toBeGreaterThan(0.9);
  expect(spans[0]!.start).toBeLessThan(1.06);
  expect(spans[0]!.end).toBeGreaterThan(1.55);
  expect(spans[0]!.end).toBeLessThan(1.72);
  expect(spans[1]!.start).toBeGreaterThan(1.9);
  expect(spans[1]!.start).toBeLessThan(2.06);
  expect(spans[1]!.end).toBeGreaterThan(3.12);
  expect(spans[1]!.end).toBeLessThan(3.32);
}, 60_000);

// Production 2026-10-17 11:14Z: Veo's track held sound under and after its words to 8 s, so all of it read as speech
// ("veo 0.44–8.00") and the line was slowed to 60% over it: the voice ran a second past the mouth (closed at 3.2 s).
test('a clip with a bed under Veo\'s words and a laugh after them: the line lands on the words only, at a natural speed', async () => {
  const BED_CLIP_URL = 'https://x.supabase.co/storage/v1/object/sign/renders/genjutsu/u/bed.mp4?token=b';
  local[BED_CLIP_URL] = join(dir, 'bed.mp4');
  // Words 0.44–3.2 s (-9 dB), a laugh 6.8–7.6 s, and a bed the whole 8 s 20 dB under the words.
  await run(BIN, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=24:duration=8',
    '-f', 'lavfi', '-i', `aevalsrc='0.5*between(t,0.44,3.2)*sin(2*PI*300*t)+0.3*between(t,6.8,7.6)*sin(2*PI*400*t)+0.05*sin(2*PI*600*t)':s=48000:d=8`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', local[BED_CLIP_URL]!]);
  // The ElevenLabs line: one phrase, 0.06–2.32 s, as in the Production run.
  local[VOICE_URL] = join(dir, 'voice-one-phrase.mp3');
  await run(BIN, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='if(between(t,0.06,2.32),0.5*sin(2*PI*220*t),0)':s=44100:d=2.6`, '-b:a', '128k', local[VOICE_URL]!]);
  await muxVoiceOntoClip(BED_CLIP_URL, VOICE_URL, 8, { bucket: 'renders', path: 'avatar-veo/id/voiced.mp4' });
  const spans = await spokenSpans(await hostedFile());
  expect(spans).toHaveLength(1); // nothing laid over the laugh
  expect(spans[0]!.start).toBeGreaterThan(0.35);
  expect(spans[0]!.start).toBeLessThan(0.5);
  // The words end at 3.2 s: the line ends with them, not a second later.
  expect(spans[0]!.end).toBeGreaterThan(3.0);
  expect(spans[0]!.end).toBeLessThan(3.35);
}, 60_000);

test('a clip with no voice of its own (the silent clips before): the line plays from its own start', async () => {
  local[VOICE_URL] = join(dir, 'voice-early.mp3');
  await run(BIN, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='if(between(t,0.1,1.0),0.5*sin(2*PI*220*t),0)':s=44100:d=1.5`, '-b:a', '128k', local[VOICE_URL]!]);
  await muxVoiceOntoClip(CLIP_URL, VOICE_URL, 8, { bucket: 'renders', path: 'avatar-veo/id/voiced.mp4' });
  const spans = await spokenSpans(await hostedFile());
  expect(spans).toHaveLength(1);
  expect(spans[0]!.start).toBeLessThan(0.2);
}, 60_000);
