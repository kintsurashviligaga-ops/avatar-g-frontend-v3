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
import { renderSubtitleCardPng } from './ffmpeg-overlay';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { MEDIA_TYPES, fetchPublicBytes } from '@/lib/web/publicFetch';
import {
  buildCaptionOverlayFilter,
  alignmentToCaptionSegments,
  type CaptionSegment,
  type ElevenAlignment,
} from './word-synced-captions';

const exec = promisify(execFile);

/** Read a video's pixel dimensions and length from `ffmpeg -i` stderr (no ffprobe in ffmpeg-static). */
function probeVideo(bin: string, inputPath: string): Promise<{ w: number | null; h: number | null; durSec: number | null }> {
  return new Promise((resolve) => {
    const ff = spawn(bin, ['-hide_banner', '-i', inputPath]);
    let err = '';
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('close', () => {
      const m = err.match(/Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
      const d = err.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
      resolve({
        w: m && m[1] ? parseInt(m[1], 10) : null,
        h: m && m[2] ? parseInt(m[2], 10) : null,
        durSec: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + parseFloat(d[3] ?? '0') : null,
      });
    });
    ff.on('error', () => resolve({ w: null, h: null, durSec: null }));
  });
}

export interface CaptionBurnOptions {
  /** Video pixel size (drives the strip height). */
  width: number;
  height: number;
  /** Cap so a long ad's caption re-encode still fits the storage limit (see 90f217f). */
  targetMasterMb?: number;
  /** The video's real length. When absent it is read from the file; the bitrate cap is spread over it. */
  durationSec?: number;
}

/** Default size the captioned master is held to: the assembler's own master target (MASTER_TARGET_MB). */
export const CAPTION_TARGET_MB = 42;
/** A captioned file bigger than this (×target) is not kept: the storage limit (~50 MB) would refuse it. */
export const CAPTION_MAX_OVER_TARGET = 1.15;
const AUDIO_KBPS = 256;

/**
 * The video bitrate cap (kbps) of the caption re-encode, so the whole captioned file lands near `targetMb`.
 *
 * ⚠️ The cap is spread over the VIDEO's length, never over the last caption's end. It used to be the caption end, so a
 * film whose narration finishes before the picture (a 24 s film with 16 s of Georgian voice) was allowed ~1.5× the rate
 * for its full length: the captioned master came out over the storage limit and the whole paid film failed at upload
 * ("exceeded the maximum allowed size", live E2E 2026-10-17 17:27Z). The longer of the two is used, so a caption that
 * runs past the picture's end can only lower the cap.
 */
export function captionBurnMaxrateKbps(o: { videoSec: number | null | undefined; captionEndSec: number; targetMb?: number }): number {
  const videoSec = typeof o.videoSec === 'number' && Number.isFinite(o.videoSec) && o.videoSec > 0 ? o.videoSec : 0;
  const durSec = Math.max(1, videoSec, o.captionEndSec + 0.5);
  return Math.max(2000, Math.round(((o.targetMb ?? CAPTION_TARGET_MB) * 8192) / durSec) - AUDIO_KBPS);
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
    const targetMb = opts.targetMasterMb ?? CAPTION_TARGET_MB;
    const videoSec = opts.durationSec ?? (await probeVideo(bin, inputPath)).durSec;
    const maxrate = captionBurnMaxrateKbps({ videoSec, captionEndSec: Math.max(...rendered.map((r) => r.seg.endSec)), targetMb });
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
    const captioned = await readFile(out);
    // Belt and braces: a file the storage would refuse fails the whole film at upload. The un-captioned master is
    // delivered instead (the caller's fail-open path), and the miss is logged.
    if (captioned.byteLength > targetMb * CAPTION_MAX_OVER_TARGET * 1024 * 1024) {
      // eslint-disable-next-line no-console
      console.warn(`[captions] captioned master ${(captioned.byteLength / 1048576).toFixed(1)} MB is over ${targetMb} MB × ${CAPTION_MAX_OVER_TARGET}; keeping the un-captioned master`);
      return null;
    }
    return captioned;
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
    const got = await fetchPublicBytes(masterUrl, { maxBytes: 400 * 1024 * 1024, accept: MEDIA_TYPES, timeoutMs: 90_000 });
    if (!got.ok) return null;
    const inPath = join(dir, 'master.mp4');
    await writeFile(inPath, got.bytes);
    const v = await probeVideo(bin, inPath);
    if (!v.w || !v.h) return null;
    const captioned = await burnCaptionSegments(inPath, segs, { width: v.w, height: v.h, ...(v.durSec ? { durationSec: v.durSec } : {}) });
    if (!captioned) return null;
    const path = `captioned/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    return await uploadBufferAndSign('renders', path, captioned, 'video/mp4', 604_800);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
