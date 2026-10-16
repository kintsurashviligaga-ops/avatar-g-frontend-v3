/**
 * lib/video/lastFrame.ts — the real last frame of a rendered clip, as a JPEG.
 *
 * A film scene that starts from the previous clip's own last frame continues exactly where that clip stopped: same
 * pose, framing, light and wardrobe across the cut. The storyboard's frame for the next scene cannot promise that (it is
 * drawn before either clip exists), and Veo did not end its clips on a requested last frame (the 2026-10-16 ad: every
 * join jumped). So the frame is read out of the finished clip.
 *
 * ffmpeg decodes only the clip's final half second (`-sseof`) and keeps overwriting one image (`-update 1`), so what is
 * left on disk is the very last decoded frame. The clip is fetched through lib/video/ffmpegExec (public hosts only, a byte
 * cap, no protocol smuggling). Never throws: null on any miss, and the caller starts the scene from its storyboard frame.
 */
import 'server-only';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { ffmpegExec, type FfmpegIo } from '@/lib/video/ffmpegExec';

/** How much of the clip's end ffmpeg decodes: enough for a frame at any frame rate, little enough to stay fast. */
export const LAST_FRAME_WINDOW_SEC = 0.5;
/** An encode that wrote nothing, or not a JPEG (SOI marker FF D8), is not a frame. */
const isJpeg = (b: Buffer): boolean => b.length > 2 && b[0] === 0xff && b[1] === 0xd8;

export interface LastFrameDeps {
  bin?: string | null;
  exec?: typeof ffmpegExec;
  io?: FfmpegIo;
  timeoutMs?: number;
}

/** The ffmpeg arguments that leave the clip's last frame in `out` (a high-quality JPEG at the clip's own size). */
export function lastFrameArgs(input: string, out: string): string[] {
  return ['-y', '-v', 'error', '-sseof', `-${LAST_FRAME_WINDOW_SEC}`, '-i', input, '-an', '-update', '1', '-q:v', '2', out];
}

export async function extractLastFrame(videoUrl: string, deps: LastFrameDeps = {}): Promise<Buffer | null> {
  const bin = deps.bin === undefined ? (ffmpegStatic as unknown as string | null) : deps.bin;
  if (!bin || !/^https?:\/\//i.test(videoUrl)) return null;
  const exec = deps.exec ?? ffmpegExec;
  const dir = await mkdtemp(join(tmpdir(), 'lastframe-'));
  try {
    const out = join(dir, 'last.jpg');
    await exec(bin, lastFrameArgs(videoUrl, out), { timeout: deps.timeoutMs ?? 60_000, maxBuffer: 4 * 1024 * 1024 }, deps.io ?? {});
    const jpeg = await readFile(out);
    return isJpeg(jpeg) ? jpeg : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[lastFrame] extraction failed:', err instanceof Error ? err.message.slice(0, 200) : err);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
