/** @jest-environment node */
/**
 * lib/video/omniEditInput — the uploaded video, measured and re-encoded for Omni's edit / extend before it is priced.
 *
 * The real ffmpeg-static binary runs on clips made here: the short side lands at 720 px or less (never upscaled), a phone's
 * rotation is applied before the frame is read, a video over 10 s or a file that is not a video is refused. Only the
 * download is swapped for the local file (it is lib/video/ffmpegExec's own tests).
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
const URL_IN = 'https://storage.example.test/u-1/chat/clip.mp4';
let local = '';

jest.mock('./ffmpegExec', () => ({
  ffmpegExec: (bin: string, args: readonly string[], opts: object) => run(bin, args.map((a) => (a === URL_IN ? local : a)), opts),
}));

import {
  inputSecondsFromLog, omniEditTranscodeArgs, outputFrameFromLog, prepareOmniEditInput, writtenSecondsFromLog,
} from './omniEditInput';

let dir: string;
const clip = (name: string) => join(dir, name);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'omni-edit-input-test-'));
  const make = (out: string, video: string, d: number, audio = true) => run(BIN, [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc=s=${video}:r=30:d=${d}`,
    ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${d}`] : []),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac', '-shortest'] : []), clip(out),
  ]);
  await Promise.all([
    make('1080p.mp4', '1920x1080', 5),
    make('portrait.mp4', '1080x1920', 4, false),
    make('small.mp4', '640x360', 3),
    make('long.mp4', '320x240', 12),
  ]);
  // A phone's recording: landscape pixels with a 90° rotation in the container.
  await run(BIN, ['-y', '-v', 'error', '-display_rotation', '90', '-i', clip('1080p.mp4'), '-c', 'copy', clip('phone.mov')]);
  await writeFile(clip('not-a-video.mp4'), Buffer.from('this is not a video at all'.repeat(100)));
}, 120_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const prepare = (name: string) => { local = clip(name); return prepareOmniEditInput(URL_IN); };

test('a 1080p upload: re-encoded to 1280×720 mp4 with its sound, measured at its own length', async () => {
  const r = await prepare('1080p.mp4');
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  expect([r.width, r.height]).toEqual([1280, 720]);
  expect(r.seconds).toBeCloseTo(5, 0);
  expect(r.mimeType).toBe('video/mp4');
  const bytes = Buffer.from(r.base64, 'base64');
  expect(bytes.byteLength).toBe(r.bytes);
  expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
}, 60_000);

test('portrait stays portrait (720×1280); a small one is never upscaled', async () => {
  const tall = await prepare('portrait.mp4');
  expect(tall).toMatchObject({ ok: true, width: 720, height: 1280 });
  const small = await prepare('small.mp4');
  expect(small).toMatchObject({ ok: true, width: 640, height: 360 });
}, 60_000);

test('a phone\'s rotation is applied before the frame is read: its landscape pixels come out portrait', async () => {
  expect(await prepare('phone.mov')).toMatchObject({ ok: true, width: 720, height: 1280 });
}, 60_000);

test('over 10 s is refused with its length; a file that is not a video is unreadable', async () => {
  const long = await prepare('long.mp4');
  expect(long).toMatchObject({ ok: false, reason: 'too_long' });
  expect(long.ok ? 0 : long.seconds).toBeCloseTo(12, 0);
  expect(await prepare('not-a-video.mp4')).toEqual({ ok: false, reason: 'unreadable' });
}, 60_000);

test('the arguments: 10.5 s at most, the first video and audio stream, 24 fps, short side ≤ 720, H.264 / AAC, faststart', () => {
  const args = omniEditTranscodeArgs('in.mp4', 'out.mp4');
  expect(args.slice(0, 3)).toEqual(['-y', '-i', 'in.mp4']);
  expect(args).toEqual(expect.arrayContaining(['-t', '10.5', '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart']));
  expect(args[args.indexOf('-vf') + 1]).toMatch(/^fps=24,scale=.*min\(720,iw\).*min\(720,ih\).*,setsar=1$/);
  expect(args[args.length - 1]).toBe('out.mp4');
});

test('the log readers: the input\'s length, how much was written, the frame of the output (not the input)', () => {
  const log = [
    "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':",
    '  Duration: 00:00:05.04, start: 0.000000, bitrate: 1234 kb/s',
    '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 30 fps',
    "Output #0, mp4, to 'out.mp4':",
    '  Stream #0:0(und): Video: h264 (avc1 / 0x31637661), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], q=2-31, 24 fps',
    'frame=   60 fps=0.0 q=28.0 size=     256KiB time=00:00:02.50 bitrate= 838.9kbits/s',
    'frame=  121 fps=0.0 q=-1.0 Lsize=     512KiB time=00:00:05.00 bitrate= 838.9kbits/s',
  ].join('\n');
  expect(inputSecondsFromLog(log)).toBeCloseTo(5.04, 2);
  expect(writtenSecondsFromLog(log)).toBeCloseTo(5, 2);
  expect(outputFrameFromLog(log)).toEqual({ width: 1280, height: 720 });
  expect(inputSecondsFromLog('  Duration: N/A, bitrate: N/A')).toBeNull();
  expect(writtenSecondsFromLog('no progress')).toBeNull();
  expect(outputFrameFromLog('Input #0 only')).toBeNull();
});
