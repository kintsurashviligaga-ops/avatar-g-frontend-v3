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
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { renderSubtitleCardPng, subtitleStripHeight } from './ffmpeg-overlay';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import {
  buildCaptionOverlayFilter,
  alignmentToCaptionSegments,
  type CaptionSegment,
  type ElevenAlignment,
} from './word-synced-captions';

const exec = promisify(execFile);

/** Read a video's pixel dimensions from `ffmpeg -i` stderr (no ffprobe in ffmpeg-static). */
function probeDims(bin: string, inputPath: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const ff = spawn(bin, ['-hide_banner', '-i', inputPath]);
    let err = '';
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('close', () => {
      const m = err.match(/Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
      resolve(m && m[1] && m[2] ? { w: parseInt(m[1], 10), h: parseInt(m[2], 10) } : null);
    });
    ff.on('error', () => resolve(null));
  });
}

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

/**
 * URL → captioned → URL. For the SINGLE-CLIP assemble path (a 1-scene ad), where the master
 * is built from URL-ops and never goes through assembleWithFfmpeg. Downloads the master,
 * probes its real dimensions, burns the word-synced captions, and re-hosts. Fail-open:
 * returns null on any miss so the caller keeps the un-captioned master.
 */
export async function overlayCaptionsOnUrl(masterUrl: string, alignment: ElevenAlignment): Promise<string | null> {
  const bin = ffmpegStatic as unknown as string | null;
  const segs = alignmentToCaptionSegments(alignment);
  if (!bin || !masterUrl || !segs.length) return null;
  const dir = await mkdtemp(join(tmpdir(), 'capurl_'));
  try {
    const res = await fetch(masterUrl);
    if (!res.ok) return null;
    const inPath = join(dir, 'master.mp4');
    await writeFile(inPath, Buffer.from(await res.arrayBuffer()));
    const dims = await probeDims(bin, inPath);
    if (!dims) return null;
    const captioned = await burnCaptionSegments(inPath, segs, { width: dims.w, height: dims.h });
    if (!captioned) return null;
    const path = `captioned/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    return await uploadBufferAndSign('renders', path, captioned, 'video/mp4', 604_800);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
