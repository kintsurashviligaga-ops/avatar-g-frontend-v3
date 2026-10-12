/**
 * lib/video/finalCut.ts — cut a hosted master to its contracted FINAL length on the 30 fps timeline (Video Core v1.0 §4).
 *
 * The multi-scene stitch does this inside lib/orchestrator/ffmpeg-assembly (`-t` on the master it encodes); this is the
 * same cut for a master that already exists as a file — the single-clip film (one 6 s clip asked as 5 s → 150 frames).
 * The picture is re-timed to VIDEO_FPS and stopped at the final length, so the delivered file holds exactly
 * framesFor(finalSec) frames (29.7 s → 891); the audio stops with it. Fail-CLOSED: a cut that cannot be made throws, and
 * the caller treats that as the attempt's failure — the uncut master is never delivered as if it were the final.
 *
 * ffmpeg never fetches a URL itself: http(s) inputs go through lib/video/ffmpegExec (public-host guard, local file).
 */
import 'server-only';
import ffmpegStatic from 'ffmpeg-static';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegExec } from '@/lib/video/ffmpegExec';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { VIDEO_FPS, framesFor } from '@/lib/video/durationContract';

const RENDER_BUCKET = process.env.RENDER_BUCKET ?? 'renders';

/** The ffmpeg argv of the cut: re-timed to `fps`, stopped at `finalSec`, one uniform x264 + AAC encode (pure; pinned by finalCut.test). */
export function finalCutArgs(input: string, out: string, finalSec: number, fps: number = VIDEO_FPS): string[] {
  return [
    '-y', '-i', input,
    '-vf', `fps=${fps}`,
    '-t', String(finalSec),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', out,
  ];
}

/** The master cut to `finalSec`, hosted (7-day signed URL). Throws when the cut cannot be made — never returns the uncut input. */
export async function cutMasterToLength(videoUrl: string, finalSec: number): Promise<string> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) throw new Error('final cut: ffmpeg binary unavailable');
  if (!videoUrl || !Number.isFinite(finalSec) || finalSec <= 0) throw new Error('final cut: nothing to cut');
  const dir = await mkdtemp(join(tmpdir(), 'finalcut-'));
  try {
    const out = join(dir, 'final.mp4');
    await ffmpegExec(bin, finalCutArgs(videoUrl, out, finalSec), { maxBuffer: 1 << 26, timeout: 180_000 });
    const buf = await readFile(out);
    if (buf.byteLength < 1_024) throw new Error('final cut: empty output');
    const path = `films/final-${Date.now()}-${framesFor(finalSec)}f-${Math.random().toString(36).slice(2, 8)}.mp4`;
    const url = await uploadBufferAndSign(RENDER_BUCKET, path, buf, 'video/mp4', 604_800);
    if (!url) throw new Error('final cut: hosting the cut master failed');
    return url;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
