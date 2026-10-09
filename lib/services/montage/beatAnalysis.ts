/**
 * lib/services/montage/beatAnalysis.ts — the ffmpeg half of "cut my clips to this music" (the arithmetic is ./beatPlan).
 *
 *   probeMedia(url)    one `ffmpeg -i` banner: length, streams, frame size, rotation, codecs (ffmpeg-static has no ffprobe);
 *   analyzeTrack(url)  one decode of the track to mono 16-bit PCM at ANALYSIS_RATE (first MAX_ANALYSIS_SEC only), whose
 *                      banner also gives the track's length, then the beat grid from it.
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
import { parseProbeBanner, type BannerProbe } from '@/lib/video/probeBanner';
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
