/** @jest-environment node */
/**
 * The caption re-encode is held to the storage limit over the VIDEO's length (live E2E 2026-10-17 17:27Z): a 24 s
 * subtitled film whose Georgian narration ended at ~16 s was capped as if it were 16 s long, came out over the ~50 MB
 * upload limit, and the whole paid film failed with "exceeded the maximum allowed size".
 *
 * The formula is checked on its own; the real bundled ffmpeg then burns captions that end early into a short, hard to
 * compress clip, once with the length read from the file and once with the old caption-end cap, which the size guard
 * must refuse (the caller then ships the un-captioned master instead of failing the film).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

jest.mock('server-only', () => ({}));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(), uploadBufferAndSign: jest.fn() }));
jest.mock('../../web/publicFetch', () => ({ MEDIA_TYPES: /.*/, fetchPublicBytes: jest.fn() }));

// eslint-disable-next-line import/first
import { CAPTION_MAX_OVER_TARGET, burnCaptionSegments, captionBurnMaxrateKbps } from './caption-burn';
// eslint-disable-next-line import/first
import type { CaptionSegment } from './word-synced-captions';

const MB = 1024 * 1024;

describe('captionBurnMaxrateKbps', () => {
  it('spreads the cap over the video, not over the last caption', () => {
    // The live failure: 24 s of picture, narration (and captions) over at 16 s.
    const kbps = captionBurnMaxrateKbps({ videoSec: 24, captionEndSec: 16, targetMb: 42 });
    const videoMb = (kbps * 24) / 8192;
    expect(videoMb + (256 * 24) / 8192).toBeLessThanOrEqual(42);
    // What the old caption-end cap allowed over the same 24 s: well past the ~50 MB storage limit.
    const old = Math.round((42 * 8192) / 16.5) - 256;
    expect((old * 24) / 8192).toBeGreaterThan(50);
  });

  it('uses the caption end when captions run past the picture, so the cap only gets lower', () => {
    expect(captionBurnMaxrateKbps({ videoSec: 10, captionEndSec: 20, targetMb: 42 })).toBe(Math.round((42 * 8192) / 20.5) - 256);
  });

  it('falls back to the caption end when the length is unknown, and keeps the 2 Mbps floor', () => {
    expect(captionBurnMaxrateKbps({ videoSec: null, captionEndSec: 9.5, targetMb: 42 })).toBe(Math.round((42 * 8192) / 10) - 256);
    expect(captionBurnMaxrateKbps({ videoSec: Number.NaN, captionEndSec: 9.5, targetMb: 1 })).toBe(2000);
    expect(captionBurnMaxrateKbps({ videoSec: 600, captionEndSec: 5, targetMb: 42 })).toBe(2000);
  });
});

const bin = ffmpegStatic as unknown as string | null;
const withFfmpeg = bin && existsSync(bin) ? describe : describe.skip;

withFfmpeg('burnCaptionSegments on the real ffmpeg', () => {
  let dir = '';
  let clip = '';
  const SEC = 10;
  // Captions end at 2 s of a 10 s clip: the shape of a film whose narration finishes before the picture.
  const segs: CaptionSegment[] = [
    { text: 'ბათუმი საღამოს', startSec: 0.2, endSec: 1.0, words: [] },
    { text: 'ყველაზე ლამაზია', startSec: 1.0, endSec: 2.0, words: [] },
  ];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'capburn-'));
    clip = join(dir, 'noise.mp4');
    // Moving noise barely compresses, so the encode runs at the cap and the cap decides the size.
    execFileSync(bin!, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `nullsrc=s=360x640:r=24:d=${SEC},geq=random(1)*255:128:128`,
      '-f', 'lavfi', '-i', `sine=frequency=440:duration=${SEC}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip,
    ]);
  }, 60_000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('reads the length from the file and lands within the target', async () => {
    const out = await burnCaptionSegments(clip, segs, { width: 360, height: 640, targetMasterMb: 4 });
    expect(out).not.toBeNull();
    // Big enough that the cap, not the content, decided the size; small enough for the target.
    expect(out!.byteLength).toBeGreaterThan(2 * MB);
    expect(out!.byteLength).toBeLessThanOrEqual(4 * CAPTION_MAX_OVER_TARGET * MB);
  }, 60_000);

  it('refuses a file over the limit instead of handing it to the upload (the old caption-end cap)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = await burnCaptionSegments(clip, segs, { width: 360, height: 640, targetMasterMb: 4, durationSec: 2.5 });
    expect(out).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('keeping the un-captioned master'));
    warn.mockRestore();
  }, 60_000);
});
