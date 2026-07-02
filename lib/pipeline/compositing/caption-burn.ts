import 'server-only';

/**
 * Word-synced caption BURN — STEP 2.3 integration.
 *
 * Renders one bottom-strip PNG per caption segment (resvg + embedded FiraGO — the only
 * Georgian-safe path on the libfreetype-less prod ffmpeg-static) and burns them into the
 * master with one time-gated `overlay=...enable='between(t,s,e)'` per segment, so exactly
 * one caption shows at a time, word-synced to the real ElevenLabs timings. Fail-open:
 * any miss returns null and the caller ships the un-captioned master.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { renderSubtitleCardPng, subtitleStripHeight } from './ffmpeg-overlay';
import {
  buildCaptionOverlayFilter,
  alignmentToCaptionSegments,
  type CaptionSegment,
  type ElevenAlignment,
} from './word-synced-captions';

const exec = promisify(execFile);

export interface CaptionBurnOptions {
  /** Video pixel size (drives the strip height). */
  width: number;
  height: number;
  /** Cap so a long ad's caption re-encode still fits the storage limit (see 90f217f). */
  targetMasterMb?: number;
}

/**
 * Burn caption segments into `inputPath` → returns the captioned video Buffer, or null on
 * any failure (caller falls back to the original). Only segments whose strip actually
 * rendered are burned (and the filter is built over exactly those), so a single failed
 * strip can't desync the rest.
 */
export async function burnCaptionSegments(
  inputPath: string,
  segments: CaptionSegment[],
  opts: CaptionBurnOptions,
): Promise<Buffer | null> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin || !segments.length) return null;
  const dir = await mkdtemp(join(tmpdir(), 'cap_'));
  try {
    // Render each strip; keep segment↔PNG alignment by dropping misses from BOTH lists.
    const rendered: { seg: CaptionSegment; path: string }[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const png = await renderSubtitleCardPng(seg.text, opts.width, opts.height);
      if (!png) continue;
      const p = join(dir, `cap${i}.png`);
      await writeFile(p, png);
      rendered.push({ seg, path: p });
    }
    if (!rendered.length) return null;

    const filter = buildCaptionOverlayFilter(rendered.map((r) => r.seg));
    const durSec = Math.max(1, Math.max(...rendered.map((r) => r.seg.endSec)) + 0.5);
    const targetMb = opts.targetMasterMb ?? 42;
    const maxrate = Math.max(2000, Math.round((targetMb * 8192) / durSec) - 256);
    const out = join(dir, 'captioned.mp4');

    const args = [
      '-y', '-i', inputPath,
      ...rendered.flatMap((r) => ['-i', r.path]),
      '-filter_complex', filter,
      '-map', '[vout]', '-map', '0:a?',
      '-c:a', 'copy',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
      '-threads', '2', '-pix_fmt', 'yuv420p',
      '-maxrate', `${maxrate}k`, '-bufsize', `${maxrate * 2}k`,
      '-movflags', '+faststart', out,
    ];
    await exec(bin, args, { maxBuffer: 1 << 28, timeout: 280_000 });
    return await readFile(out);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Convenience: ElevenLabs with-timestamps `alignment` → burned captioned video. */
export async function burnWordSyncedCaptions(
  inputPath: string,
  alignment: ElevenAlignment,
  opts: CaptionBurnOptions,
): Promise<Buffer | null> {
  return burnCaptionSegments(inputPath, alignmentToCaptionSegments(alignment), opts);
}
