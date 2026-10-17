/** @jest-environment node */
jest.mock('server-only', () => ({}));

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';
import { extractLastFrame, lastFrameArgs } from './lastFrame';

const run = promisify(execFile);
const BIN = ffmpegStatic as unknown as string;
const URL_IN = 'https://cdn.example.test/clip.mp4';

let dir: string;
let clip: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lastframe-test-'));
  clip = join(dir, 'clip.mp4');
  // 3 s at 24 fps: blue for 2.5 s, then red for the last 0.5 s. The last frame is red.
  await run(BIN, [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=24:d=2.5',
    '-f', 'lavfi', '-i', 'color=c=red:s=320x240:r=24:d=0.5',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip,
  ]);
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** ffmpeg on the local clip in place of the downloaded one (the download itself is lib/video/ffmpegExec's own tests). */
const localExec = (async (bin: string, args: readonly string[]) => {
  const argv = args.map((a) => (a === URL_IN ? clip : a));
  return run(bin, argv) as Promise<{ stdout: string; stderr: string }>;
}) as unknown as typeof import('./ffmpegExec').ffmpegExec;

describe('extractLastFrame', () => {
  it('returns the clip’s final frame as a JPEG at the clip’s size', async () => {
    const jpeg = await extractLastFrame(URL_IN, { bin: BIN, exec: localExec });
    expect(jpeg).not.toBeNull();
    const meta = await sharp(jpeg!).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([320, 240]);
    const { channels } = await sharp(jpeg!).stats();
    // Red, not the blue that fills the first 2.5 s.
    expect(channels[0]!.mean).toBeGreaterThan(200);
    expect(channels[2]!.mean).toBeLessThan(60);
  }, 30_000);

  it('decodes only the end of the clip and keeps the last image', () => {
    const args = lastFrameArgs(URL_IN, '/tmp/x.jpg');
    expect(args.indexOf('-sseof')).toBeLessThan(args.indexOf('-i'));
    expect(args).toEqual(expect.arrayContaining(['-update', '1', '-an']));
  });

  it('gives null (never throws) when ffmpeg fails, the binary is missing or the address is not http(s)', async () => {
    const failing = (async () => { throw new Error('boom'); }) as unknown as typeof import('./ffmpegExec').ffmpegExec;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(extractLastFrame(URL_IN, { bin: BIN, exec: failing })).resolves.toBeNull();
    await expect(extractLastFrame(URL_IN, { bin: null, exec: localExec })).resolves.toBeNull();
    await expect(extractLastFrame('file:///etc/passwd', { bin: BIN, exec: localExec })).resolves.toBeNull();
  });
});
