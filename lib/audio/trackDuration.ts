import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { parseFfmpegDuration } from '@/lib/video/sequenceWindows';

const exec = promisify(execFile);

/**
 * Real length of an audio buffer, in seconds.
 *
 * Needed because music is billed by duration while the primary engine does not accept one — see
 * lib/credits/musicSettlement for the full story. The bytes are already in hand at the call site, so this
 * measures them LOCALLY: no second fetch of the track we just uploaded.
 *
 * Returns 0 on any miss (no binary, unreadable container, timeout). `settleMusicCharge` treats 0 as
 * "unmeasured" and leaves the charge alone, so a probe failure can never hand out credits.
 *
 * ffmpeg-static must be traced into any lambda that calls this — /api/ai/music already carries it.
 */
export async function probeTrackDurationSec(bytes: Buffer, ext = 'mp3'): Promise<number> {
  const bin = (ffmpegStatic as unknown as string) || '';
  if (!bin || !bytes?.byteLength) return 0;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'trackdur-'));
    const file = join(dir, `t.${/^[a-z0-9]{2,4}$/i.test(ext) ? ext : 'mp3'}`);
    await writeFile(file, bytes);
    try {
      // `-i` with no output prints the container banner to stderr, then exits non-zero → the catch has it.
      await exec(bin, ['-hide_banner', '-i', file], { maxBuffer: 1 << 22, timeout: 20_000 });
      return 0;
    } catch (e) {
      return parseFfmpegDuration(String((e as { stderr?: string }).stderr ?? (e as Error).message ?? ''));
    }
  } catch {
    return 0;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
