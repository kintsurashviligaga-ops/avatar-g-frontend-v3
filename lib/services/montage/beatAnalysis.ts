/**
 * lib/services/montage/beatAnalysis.ts — the ffmpeg half of "cut my clips to this music" (the arithmetic is ./beatPlan).
 *
 *   probeMedia(url)    one `ffmpeg -i` banner: length, streams, frame size, rotation, codecs (ffmpeg-static has no ffprobe);
 *   analyzeTrack(url)  one decode of the track to mono 16-bit PCM at ANALYSIS_RATE (first MAX_ANALYSIS_SEC only), whose
 *                      banner also gives the track's length, then the beat grid from it;
 *   grabFrames(url, t) tiny grey frames at given times, one download and one ffmpeg run for all of them: the per-clip QC
 *                      of the finished master (lib/agent/media/montageAsk qcClips);
 *   streamDurations    the real length of a file's picture and sound streams from their packets (no decode): the A/V
 *                      check of the master (montageAsk qcAvSync).
 *
 * Every input goes through lib/video/ffmpegExec: ffmpeg never fetches a URL itself (public hosts only, media types only,
 * size-capped download, local demuxers only). Fail-open to null, like the other ffmpeg helpers: the caller turns null
 * into a refusal that names the file.
 *
 * NOTE (Vercel): a route importing this must list ./node_modules/ffmpeg-static/** in next.config.js
 * outputFileTracingIncludes, or the binary is absent in the lambda.
 */
import 'server-only';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { ffmpegExec } from '@/lib/video/ffmpegExec';
import { parseFrameCrc, parseProbeBanner, type BannerProbe, type StreamDurations } from '@/lib/video/probeBanner';
import { ANALYSIS_HOP, ANALYSIS_RATE, MAX_ANALYSIS_SEC, estimateBeatGrid, onsetStrength, type BeatGrid } from './beatPlan';

function bin(): string | null {
  return (ffmpegStatic as unknown as string | null) ?? null;
}

const stderrOf = (e: unknown): string => String((e as { stderr?: string })?.stderr ?? (e as Error)?.message ?? '');

/** Probe one input; null when ffmpeg is missing or the input could not be fetched or read at all. */
export async function probeMedia(url: string, timeoutMs = 90_000): Promise<BannerProbe | null> {
  const b = bin();
  if (!b) return null;
  let text = '';
  try {
    // `-i` with no output prints the input banner to stderr and exits non-zero: the catch has it.
    await ffmpegExec(b, ['-hide_banner', '-i', url], { maxBuffer: 1 << 22, timeout: timeoutMs });
  } catch (e) {
    text = stderrOf(e);
  }
  if (/^ffmpeg input refused/i.test(text)) return null;
  const probe = parseProbeBanner(text);
  return probe.durationSec > 0 || probe.hasVideo || probe.hasAudio ? probe : null;
}

/** Decode the track and find its beat. Null when it cannot be decoded; `grid` null when it has no pulse. */
export async function analyzeTrack(url: string, timeoutMs = 120_000): Promise<{ probe: BannerProbe; grid: BeatGrid | null } | null> {
  const b = bin();
  if (!b) return null;
  const dir = await mkdtemp(join(tmpdir(), 'beat-'));
  const out = join(dir, 'track.pcm');
  try {
    const { stderr } = await ffmpegExec(
      b,
      ['-hide_banner', '-y', '-i', url, '-t', String(MAX_ANALYSIS_SEC), '-vn', '-ac', '1', '-ar', String(ANALYSIS_RATE), '-f', 's16le', out],
      { maxBuffer: 1 << 22, timeout: timeoutMs },
    );
    const probe = parseProbeBanner(stderr);
    const buf = await readFile(out);
    if (!probe.hasAudio || buf.byteLength < ANALYSIS_HOP * 2 * 8) return null;
    // Copy into an aligned buffer: a Buffer's byteOffset need not be even.
    const pcm = new Int16Array(buf.byteLength >> 1);
    for (let i = 0; i < pcm.length; i += 1) pcm[i] = buf.readInt16LE(i * 2);
    const grid = estimateBeatGrid(onsetStrength(pcm, ANALYSIS_HOP), ANALYSIS_HOP / ANALYSIS_RATE);
    return { probe, grid };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export interface GrabOptions {
  /** Each frame comes back `size`×`size` pixels, 8-bit grey (size² bytes). */
  size: number;
  /**
   * Conform the frame to this output frame first, exactly as the montage lane conforms a clip (lib/video/remixOps
   * fitAspect: cover-scale, then centre-crop), so a source frame compares with the master's frame of it.
   */
  fit?: { w: number; h: number };
  timeoutMs?: number;
}

/**
 * Tiny grey frames of `url` at each of `timesSec` (null where no frame was there). One input per time, each with its
 * own accurate seek, all over ONE download (lib/video/ffmpegExec fetches a URL once per call however often it is an
 * input) and one ffmpeg run. Null when ffmpeg is missing or the file could not be read at all.
 */
export async function grabFrames(url: string, timesSec: readonly number[], opts: GrabOptions): Promise<Array<Uint8Array | null> | null> {
  const b = bin();
  const size = Math.max(4, Math.min(256, Math.round(opts.size)));
  if (!b || !timesSec.length || timesSec.some((t) => !Number.isFinite(t) || t < 0)) return null;
  const dir = await mkdtemp(join(tmpdir(), 'mqc-'));
  try {
    const chain = [
      ...(opts.fit ? [`scale=${opts.fit.w}:${opts.fit.h}:force_original_aspect_ratio=increase`, `crop=${opts.fit.w}:${opts.fit.h}`] : []),
      `scale=${size}:${size}:flags=area`,
      'format=gray',
    ].join(',');
    const args = ['-hide_banner', '-loglevel', 'error', '-y'];
    // No seek for t = 0: ffmpeg's image demuxer returns NO frame for a still opened with `-ss 0` (a photo of an Agent G
    // montage is checked at its own t = 0, ../../agent/media/montageAsk clipCheckPoints), and a video needs none there.
    timesSec.forEach((t) => args.push(...(t > 0 ? ['-ss', t.toFixed(3)] : []), '-i', url));
    const outs = timesSec.map((_, i) => join(dir, `f${i}.gray`));
    outs.forEach((out, i) => args.push('-map', `${i}:v:0`, '-frames:v', '1', '-vf', chain, '-f', 'rawvideo', '-pix_fmt', 'gray', out));
    await ffmpegExec(b, args, { maxBuffer: 1 << 22, timeout: opts.timeoutMs ?? 120_000 });
    const frames: Array<Uint8Array | null> = [];
    for (const out of outs) {
      const buf = await readFile(out).catch(() => null);
      frames.push(buf && buf.byteLength === size * size ? new Uint8Array(buf) : null);
    }
    return frames;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** The real length of the picture and the sound of `url`, from their packets (stream copy, no decode). Null = unreadable. */
export async function streamDurations(url: string, timeoutMs = 120_000): Promise<StreamDurations | null> {
  const b = bin();
  if (!b) return null;
  try {
    const { stdout } = await ffmpegExec(
      b,
      ['-hide_banner', '-loglevel', 'error', '-i', url, '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-f', 'framecrc', '-'],
      { maxBuffer: 1 << 25, timeout: timeoutMs },
    );
    return parseFrameCrc(stdout);
  } catch {
    return null;
  }
}
