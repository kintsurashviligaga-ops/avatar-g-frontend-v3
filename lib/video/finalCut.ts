/**
 * lib/video/finalCut.ts — cut a hosted master to its contracted FINAL length on the 30 fps timeline (Video Core v1.0 §4).
 *
 * The multi-scene stitch does this inside lib/orchestrator/ffmpeg-assembly (`-t` on the master it encodes); this is the
 * same cut for a master that already exists as a file — the single-clip film (one 6 s clip asked as 5 s → 150 frames).
 * The picture is re-timed to VIDEO_FPS and stopped at the final length, so the delivered file holds exactly
 * framesFor(finalSec) frames (29.7 s → 891); the audio stops with it. Fail-CLOSED: a cut that cannot be made throws, and
 * so does a cut whose decoded frame count is not framesFor(finalSec) (counted before hosting, lib/video/frameCount); the
 * caller treats either as the attempt's failure — the uncut master is never delivered as if it were the final.
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
import { countDecodedFrames } from '@/lib/video/frameCount';

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

/**
 * The single-clip QC gate's refusal: the cut's decoded frame count is not framesFor(finalSec). The assemble route answers it
 * as `502 qc_rejected` (codes ['frame_count_mismatch'] or ['frame_count_unverified']) after rolling the attempt back, the same answer the stitched master's
 * MasterQaRejected gets — one refusal vocabulary for both paths (lib/video/contracts VIDEO_REFUSALS).
 */
export type FinalCutIssueCode = 'frame_count_mismatch' | 'frame_count_unverified';

export class FinalCutRejected extends Error {
  readonly code = 'qc_rejected' as const;
  readonly issueCodes: readonly [FinalCutIssueCode];
  readonly expectedFrames: number;
  /** The frames the cut decoded to; null when they could not be counted (the check did not run — also a refusal). */
  readonly actualFrames: number | null;
  constructor(actualFrames: number | null, expectedFrames: number) {
    const diff = actualFrames === null ? 0 : actualFrames - expectedFrames;
    super(actualFrames === null
      ? `final cut: frame_count_unverified — the cut's frames could not be counted, the contracted final is ${expectedFrames}; a check that did not run is not a pass`
      : `final cut: frame_count_mismatch — the cut holds ${actualFrames} frames, the contracted final is ${expectedFrames} (${diff > 0 ? '+' : ''}${diff})`);
    this.name = 'FinalCutRejected';
    this.issueCodes = [actualFrames === null ? 'frame_count_unverified' : 'frame_count_mismatch'];
    this.expectedFrames = expectedFrames;
    this.actualFrames = actualFrames;
  }
}

export function isFinalCutRejected(err: unknown): err is FinalCutRejected {
  return err instanceof FinalCutRejected
    || (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'qc_rejected' && Array.isArray((err as { issueCodes?: unknown }).issueCodes));
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
    // Video Core v1.0 §4/§7 — the cut is checked on its DECODED frames before it is hosted, like the stitched master
    // (ffmpeg-assembly → masterQa frame_count_mismatch): a count that is off throws, and the catch in the route rolls
    // the attempt back. A count that could not be read throws too (round 3, P0 — frame_count_unverified): the check
    // is mandatory under a contract, and a cut nobody could count is not a frame-accurate one; it used to be delivered.
    const expectedFrames = framesFor(finalSec);
    const actualFrames = await countDecodedFrames(bin, out).catch(() => null);
    if (actualFrames === null || actualFrames !== expectedFrames) {
      throw new FinalCutRejected(actualFrames, expectedFrames);
    }
    const path = `films/final-${Date.now()}-${framesFor(finalSec)}f-${Math.random().toString(36).slice(2, 8)}.mp4`;
    const url = await uploadBufferAndSign(RENDER_BUCKET, path, buf, 'video/mp4', 604_800);
    if (!url) throw new Error('final cut: hosting the cut master failed');
    return url;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
