/** @jest-environment node */
// lib/video/ffmpegExec — ffmpeg never fetches a caller's URL itself. Runs the bundled ffmpeg on tiny generated media;
// the network is a fake fetch + DNS, so the guard's decisions are checked offline.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { ffmpegExec } from './ffmpegExec';

const bin = ffmpegStatic as unknown as string;
const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }];
let dir = '';
let clip: Buffer;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ffexec-test-'));
  const out = join(dir, 'clip.mp4');
  execFileSync(bin, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x64:rate=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out], { stdio: 'ignore' });
  clip = readFileSync(out);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const serve = (body: BodyInit, type: string, seen: string[] = []) =>
  (async (u: string) => { seen.push(u); return new Response(body, { status: 200, headers: { 'content-type': type } }); }) as unknown as typeof fetch;

describe('ffmpegExec', () => {
  test('a public clip is downloaded first and read as a local file under the whitelists', async () => {
    const seen: string[] = [];
    const url = 'https://cdn.example/renders/clip.mp4?token=x';
    const r = await ffmpegExec(bin, ['-hide_banner', '-i', url, '-f', 'null', '-'], { timeout: 30_000 }, { fetchImpl: serve(new Uint8Array(clip), 'video/mp4', seen), lookupImpl: PUBLIC });
    expect(seen).toEqual([url]);
    expect(r.stderr).toMatch(/Input #0, mov,mp4/);
    expect(r.stderr).not.toContain('cdn.example'); // ffmpeg saw only the local copy
  });

  test('a clip that redirects to the metadata service is refused before ffmpeg runs', async () => {
    const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/computeMetadata/v1/' } })) as unknown as typeof fetch;
    await expect(ffmpegExec(bin, ['-i', 'https://cdn.example/a.mp4', '-f', 'null', '-'], {}, { fetchImpl, lookupImpl: PUBLIC }))
      .rejects.toThrow('ffmpeg input refused (blocked_host)');
  });

  test('a host that resolves privately is refused', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    await expect(ffmpegExec(bin, ['-i', 'https://rebind.example/a.mp4', '-f', 'null', '-'], {}, { fetchImpl, lookupImpl: async () => [{ address: '10.0.0.5', family: 4 }] }))
      .rejects.toThrow('ffmpeg input refused (blocked_host)');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('a playlist is not media: refused by type, and by demuxer when it lies about its type', async () => {
    const m3u8 = '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1.0,\nfile:///etc/hostname\n#EXT-X-ENDLIST\n';
    await expect(ffmpegExec(bin, ['-i', 'https://cdn.example/a.m3u8', '-f', 'null', '-'], {}, { fetchImpl: serve(m3u8, 'application/vnd.apple.mpegurl'), lookupImpl: PUBLIC }))
      .rejects.toThrow('ffmpeg input refused (wrong_type)');
    await expect(ffmpegExec(bin, ['-i', 'https://cdn.example/a.mp4', '-f', 'null', '-'], {}, { fetchImpl: serve(m3u8, 'video/mp4'), lookupImpl: PUBLIC }))
      .rejects.toMatchObject({ stderr: expect.stringMatching(/Invalid data found/) });
  });

  test('local inputs and lavfi sources pass through untouched', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const r = await ffmpegExec(bin, ['-hide_banner', '-f', 'lavfi', '-i', 'sine=duration=0.2', '-f', 'null', '-'], {}, { fetchImpl, lookupImpl: PUBLIC });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.stderr).toMatch(/Input #0, lavfi/);
  });

  test('the same address used twice is downloaded once', async () => {
    const seen: string[] = [];
    const url = 'https://cdn.example/clip.mp4';
    const r = await ffmpegExec(bin, ['-hide_banner', '-i', url, '-i', url, '-map', '0:v', '-map', '1:v', '-f', 'null', '-'], { timeout: 30_000 }, { fetchImpl: serve(new Uint8Array(clip), 'video/mp4', seen), lookupImpl: PUBLIC });
    expect(seen).toHaveLength(1);
    expect(r.stderr).toMatch(/Input #1, mov,mp4/);
  });
});
