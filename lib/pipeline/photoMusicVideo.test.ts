/** @jest-environment node */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { buildPhotoVideoArgs, renderPhotoMusicVideo } from './photoMusicVideo';

const exec = promisify(execFile);
const bin = ffmpegStatic as unknown as string;

describe('buildPhotoVideoArgs — codec/format contract', () => {
  it('multiplexes -loop 1 image + audio → h264 / aac / yuv420p / -shortest', () => {
    const a = buildPhotoVideoArgs('/tmp/i.png', '/tmp/a.m4a', '/tmp/o.mp4');
    const s = a.join(' ');
    expect(a).toEqual(expect.arrayContaining(['-loop', '1', '-shortest', '-pix_fmt', 'yuv420p']));
    expect(s).toContain('-c:v libx264');
    expect(s).toContain('-c:a aac');
    expect(s).toContain("scale='trunc(iw/2)*2':'trunc(ih/2)*2'"); // even-dimension guard for yuv420p
    expect(a[a.length - 1]).toBe('/tmp/o.mp4');                    // output path is last
    expect(a.indexOf('/tmp/i.png')).toBeLessThan(a.indexOf('/tmp/a.m4a')); // looped image before audio
  });
});

describe('renderPhotoMusicVideo — real ffmpeg multiplex', () => {
  jest.setTimeout(60_000);
  let dir: string;
  let imgBuf: Buffer;
  let audBuf: Buffer;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pmvtest_'));
    const img = join(dir, 'src.png');
    const aud = join(dir, 'src.m4a');
    // ODD height (90x91) so the even-dimension guard is genuinely exercised.
    await exec(bin, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=90x91:d=1', '-frames:v', '1', img]);
    // A 2.0s tone → aac (a known audio length to match against).
    await exec(bin, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'aac', aud]);
    imgBuf = await readFile(img);
    audBuf = await readFile(aud);
  });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it('produces a valid h264/aac MP4 whose duration matches the audio (~2s), even dimensions, yuv420p', async () => {
    const { mp4, durationSec } = await renderPhotoMusicVideo(imgBuf, audBuf, 'png');
    expect(mp4.byteLength).toBeGreaterThan(1000);
    expect(mp4.subarray(4, 8).toString('latin1')).toBe('ftyp'); // MP4 container magic

    // Duration matches the audio length via -shortest.
    expect(durationSec).not.toBeNull();
    expect(durationSec!).toBeGreaterThan(1.7);
    expect(durationSec!).toBeLessThan(2.6);

    // Probe the encoded streams.
    const probePath = join(dir, 'probe.mp4');
    await writeFile(probePath, mp4);
    let log = '';
    try { await exec(bin, ['-i', probePath], { maxBuffer: 1 << 24 }); } catch (e: unknown) { log = String((e as { stderr?: string } | null)?.stderr ?? ''); }
    expect(log).toMatch(/Video:\s*h264/);
    expect(log).toMatch(/Audio:\s*aac/);
    expect(log).toMatch(/yuv420p/);
    const dim = log.match(/,\s*(\d{2,5})x(\d{2,5})/);
    expect(dim).not.toBeNull();
    expect(Number(dim![1]) % 2).toBe(0); // 90 → even
    expect(Number(dim![2]) % 2).toBe(0); // 91 → 90 (even-dim guard)
  });
});
