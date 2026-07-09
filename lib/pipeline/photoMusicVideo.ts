/**
 * lib/pipeline/photoMusicVideo.ts
 * ==============================
 * DAY-4 — Photo-to-Music-Video multiplex. Pair a user's single uploaded still image with a freshly generated
 * audio track into ONE web/mobile-compatible MP4:
 *   • -loop 1        → the single image is looped for the whole clip
 *   • -shortest      → the video is trimmed to the (shorter) audio track's length
 *   • libx264 / aac  → the standard, universally-decodable codecs
 *   • yuv420p        → 4:2:0 chroma for maximum native playback across every mobile + web browser
 *   • scale trunc/2  → force EVEN dimensions (yuv420p rejects odd width/height — an arbitrary upload would
 *                      otherwise fail the encode)
 *
 * Kept free of `server-only` (only node fs/child_process + ffmpeg-static) so the arg builder + the real
 * multiplex are unit/integration-testable. The route (app/api/music/video) owns auth, validation, and upload.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

const exec = promisify(execFile);

/**
 * The exact ffmpeg arg vector for the photo+audio multiplex. Pure (no I/O) so the codec/format contract
 * (-loop 1 · -shortest · libx264 · aac · yuv420p) is unit-assertable.
 */
export function buildPhotoVideoArgs(imagePath: string, audioPath: string, outPath: string): string[] {
  return [
    '-y',
    '-loop', '1', '-framerate', '2', '-i', imagePath, // the single looped still (low fps → tiny static video)
    '-i', audioPath,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
    // Even-dimension guard + universal 4:2:0 pixel format.
    '-vf', "scale='trunc(iw/2)*2':'trunc(ih/2)*2'", '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart',
    outPath,
  ];
}

/** Parse a media file's duration (seconds) from `ffmpeg -i` stderr; null when unreadable. */
async function probeDurationSec(bin: string, file: string): Promise<number | null> {
  let log = '';
  try { await exec(bin, ['-i', file], { maxBuffer: 1 << 24 }); } catch (e: unknown) { log = String((e as { stderr?: string } | null)?.stderr ?? ''); }
  const m = log.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3] ?? '0') : null;
}

export interface PhotoMusicVideoResult { mp4: Buffer; durationSec: number | null }

/**
 * Multiplex an image buffer + an audio buffer into an MP4 buffer via the bundled ffmpeg-static. `imageExt`
 * is only the temp filename hint (ffmpeg sniffs the real format). Returns the encoded bytes + the output
 * duration (which equals the audio length via -shortest). Cleans up its temp dir. Throws on any ffmpeg error.
 */
export async function renderPhotoMusicVideo(imageBuffer: Buffer, audioBuffer: Buffer, imageExt = 'png'): Promise<PhotoMusicVideoResult> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) throw new Error('ffmpeg binary unavailable');
  const dir = await mkdtemp(join(tmpdir(), 'pmv_'));
  try {
    const imgPath = join(dir, `image.${imageExt || 'png'}`);
    const audPath = join(dir, 'audio.m4a');
    const outPath = join(dir, 'music-video.mp4');
    await writeFile(imgPath, imageBuffer);
    await writeFile(audPath, audioBuffer);
    await exec(bin, buildPhotoVideoArgs(imgPath, audPath, outPath), { maxBuffer: 1 << 28, timeout: 180_000 });
    const mp4 = await readFile(outPath);
    const durationSec = await probeDurationSec(bin, outPath);
    return { mp4, durationSec };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
