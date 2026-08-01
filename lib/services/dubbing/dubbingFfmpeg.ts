/**
 * lib/services/dubbing/dubbingFfmpeg.ts — dubbing legs 1, 5 and 6 (extract · sync · mix).
 *
 * ⚠️ VERCEL: every route that reaches this module MUST be listed in next.config.js
 * `experimental.outputFileTracingIncludes` with `./node_modules/ffmpeg-static/**`, or the binary is simply
 * absent in the lambda and every call fails with a silent ENOENT.
 *
 * BACKGROUND BED — an honest limitation, stated here because it is audible in the product: this repo has no
 * source-separation stem splitter, so the music/ambience bed is the ORIGINAL audio DUCKED, not an
 * instrumental stem. The original voices stay faintly present underneath the dub (the "UN interpreter"
 * sound) rather than being removed. Wiring a separator later only changes `bedUrl` — the mix is unchanged.
 *
 * Fail-open like the rest of lib/audio: null on any miss, never throws.
 */
import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { reportError } from '@/lib/observability/report-error';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { fitSpeed } from './dubbingPlan';

const exec = promisify(execFile);
const WEEK_SEC = 604_800;
const FF_TIMEOUT_MS = 540_000;
/** amix stops being reliable with very many inputs, and the arg list gets unwieldy — mix in groups. */
const MIX_GROUP = 40;

function bin(): string | null {
  return (ffmpegStatic as unknown as string) || null;
}

/** atempo is limited to 0.5–2.0 per instance; `fitSpeed` already clamps to [0.75, 1.25], so one is enough. */
function atempoArg(speed: number): string | null {
  return Math.abs(speed - 1) > 1e-3 ? `atempo=${speed.toFixed(4)}` : null;
}

/**
 * Duration of any media URL, in seconds. ffmpeg-static ships no ffprobe, so this decodes to null and reads
 * the final `time=` — slower than a probe but it needs no second binary.
 */
export async function probeDurationSec(url: string): Promise<number | null> {
  const ff = bin();
  if (!ff || !url) return null;
  try {
    // ffmpeg writes progress to stderr and exits 0; execFile only rejects on a real failure.
    const { stderr } = await exec(ff, ['-i', url, '-f', 'null', '-'], {
      maxBuffer: 1 << 26,
      timeout: FF_TIMEOUT_MS,
    }).catch((e: unknown) => ({ stderr: String((e as { stderr?: string })?.stderr ?? '') }));
    let last: number | null = null;
    for (const m of String(stderr).matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)) {
      last = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
    return last && last > 0 ? last : null;
  } catch {
    return null;
  }
}

export interface ExtractedAudio {
  buffer: Buffer;
  durationSec: number | null;
}

/**
 * LEG 1 — pull the audio track off the source video as 128k mono mp3. Mono and modest bitrate on purpose:
 * this buffer is uploaded to Scribe, and speech recognition gains nothing from stereo or 320k.
 */
export async function extractAudioTrack(videoUrl: string): Promise<ExtractedAudio | null> {
  const ff = bin();
  if (!ff || !videoUrl) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'dub-extract-'));
    const out = join(dir, 'audio.mp3');
    const { stderr } = await exec(
      ff,
      ['-y', '-i', videoUrl, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', out],
      { maxBuffer: 1 << 26, timeout: FF_TIMEOUT_MS },
    );
    const buffer = await readFile(out);
    // A few hundred bytes is an mp3 header with no audio — a silent video, not a usable track.
    if (buffer.byteLength < 1024) return null;
    let durationSec: number | null = null;
    for (const m of String(stderr).matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)) {
      durationSec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
    return { buffer, durationSec };
  } catch (err) {
    console.warn('[dub/extract] failed:', err instanceof Error ? err.message : err);
    reportError(err, { where: 'dubbingFfmpeg.extract' });
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** One synthesized line, ready to be placed on the timeline. */
export interface PlacedClip {
  /** Fetchable URL of the synthesized speech for this segment. */
  url: string;
  /** Where it belongs on the original timeline. */
  startSec: number;
  /** The original slot length — what the clip is time-fitted to. */
  slotSec: number;
  /** Measured length of the synthesized audio; null skips fitting for that clip. */
  synthesizedSec?: number | null;
}

export interface MixOptions {
  /** Original audio, used as the (ducked) music/ambience bed. Null = dub over silence. */
  bedUrl?: string | null;
  /** How far the bed is pushed down under the dub, in dB. */
  bedDuckDb?: number;
  /** Total timeline length — the mix is cut to exactly this so it lines up with the picture. */
  totalSec: number;
}

/**
 * LEGS 5 + 6 — time-fit each synthesized line (`atempo`) and place it at its original timestamp
 * (`adelay`), then mix everything over the ducked bed.
 *
 * Returns a hosted URL for the finished dub track, or null.
 */
export async function mixDubbedTrack(clips: readonly PlacedClip[], opts: MixOptions): Promise<string | null> {
  const ff = bin();
  if (!ff || !clips.length || !(opts.totalSec > 0)) return null;
  const duckDb = Number.isFinite(opts.bedDuckDb) ? (opts.bedDuckDb as number) : -14;

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'dub-mix-'));

    // Pass 1 — mix the clips in groups. Each group renders a full-length track so the groups can simply be
    // summed afterwards without any further offsetting.
    const groupFiles: string[] = [];
    for (let g = 0; g < clips.length; g += MIX_GROUP) {
      const group = clips.slice(g, g + MIX_GROUP);
      const args: string[] = ['-y'];
      for (const c of group) args.push('-i', c.url);

      const filters: string[] = [];
      const labels: string[] = [];
      group.forEach((c, i) => {
        const speed =
          c.synthesizedSec && c.synthesizedSec > 0 && c.slotSec > 0
            ? fitSpeed(c.synthesizedSec, c.slotSec)
            : 1;
        const chain = ['aresample=44100', 'aformat=sample_fmts=fltp:channel_layouts=stereo'];
        const tempo = atempoArg(speed);
        if (tempo) chain.push(tempo);
        // adelay is in MILLISECONDS; `all=1` applies it to both channels (without it only the left moves).
        chain.push(`adelay=${Math.max(0, Math.round(c.startSec * 1000))}:all=1`);
        filters.push(`[${i}:a]${chain.join(',')}[c${i}]`);
        labels.push(`[c${i}]`);
      });
      // normalize=0 keeps each line at full level — amix's default divides by the input count, which would
      // make a busy scene quieter than a monologue.
      filters.push(
        `${labels.join('')}amix=inputs=${group.length}:normalize=0:dropout_transition=0[gout]`,
      );

      const file = join(dir, `group-${g}.wav`);
      args.push(
        '-filter_complex', filters.join(';'),
        '-map', '[gout]',
        '-t', opts.totalSec.toFixed(3),
        '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2',
        file,
      );
      await exec(ff, args, { maxBuffer: 1 << 26, timeout: FF_TIMEOUT_MS });
      groupFiles.push(file);
    }

    // Pass 2 — sum the groups over the ducked bed and encode.
    const args: string[] = ['-y'];
    const bed = opts.bedUrl?.trim() || null;
    if (bed) args.push('-i', bed);
    for (const f of groupFiles) args.push('-i', f);

    const filters: string[] = [];
    const labels: string[] = [];
    let idx = 0;
    if (bed) {
      filters.push(
        `[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${duckDb}dB[bed]`,
      );
      labels.push('[bed]');
      idx = 1;
    }
    groupFiles.forEach((_, i) => labels.push(`[${idx + i}:a]`));

    const out = join(dir, 'dub.m4a');
    if (labels.length > 1) {
      filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[out]`);
    } else {
      filters.push(`${labels[0]}anull[out]`);
    }
    args.push(
      '-filter_complex', filters.join(';'),
      '-map', '[out]',
      '-t', opts.totalSec.toFixed(3),
      '-c:a', 'aac', '-b:a', '192k',
      out,
    );
    await exec(ff, args, { maxBuffer: 1 << 26, timeout: FF_TIMEOUT_MS });

    const buf = await readFile(out);
    if (buf.byteLength < 1024) return null;
    const path = `dubbing/track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`;
    return (await uploadAndSign('renders', path, buf.toString('base64'), 'audio/mp4', WEEK_SEC)) ?? null;
  } catch (err) {
    console.warn('[dub/mix] failed:', err instanceof Error ? err.message : err);
    reportError(err, { where: 'dubbingFfmpeg.mix' });
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * LEG 6 (final) — put the dubbed track onto the picture. The video stream is COPIED, never re-encoded:
 * re-encoding costs minutes and visibly degrades a clip whose picture we did not touch.
 */
export async function muxDubOntoVideo(videoUrl: string, audioUrl: string): Promise<string | null> {
  const ff = bin();
  if (!ff || !videoUrl || !audioUrl) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'dub-mux-'));
    const out = join(dir, 'dubbed.mp4');
    await exec(
      ff,
      [
        '-y', '-i', videoUrl, '-i', audioUrl,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        // -shortest guards a bed that overruns the picture by a frame or two.
        '-shortest', '-movflags', '+faststart',
        out,
      ],
      { maxBuffer: 1 << 26, timeout: FF_TIMEOUT_MS },
    );
    const buf = await readFile(out);
    if (buf.byteLength < 4096) return null;
    const path = `dubbing/video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    // Upload the BYTES, not a base64 string of them. The picture is stream-copied above, so this file is
    // as big as the user's source (up to the 300s MAX_SOURCE_SEC ceiling). `uploadAndSign` takes base64,
    // so this used to hold the buffer, a 1.33x string of it and the adapter's decoded copy at the same
    // time — ~3.3x the file, at the very last step of a job that has already spent ten minutes. Same fix,
    // same reason, as lib/video/surgicalOps.ts `host()`. (Local import: the module is already loaded, and
    // `uploadAndSign` is still used by mixDubbedTrack/hostSubtitles in this file.)
    const { uploadBufferAndSign } = await import('@/lib/orchestrator/storage-adapter');
    return (await uploadBufferAndSign('renders', path, buf, 'video/mp4', WEEK_SEC)) ?? null;
  } catch (err) {
    console.warn('[dub/mux] failed:', err instanceof Error ? err.message : err);
    reportError(err, { where: 'dubbingFfmpeg.mux' });
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Host the SRT of the translated dialogue so the player can offer it as a subtitle track. */
export async function hostSubtitles(srt: string): Promise<string | null> {
  if (!srt.trim()) return null;
  try {
    const path = `dubbing/subs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.srt`;
    return (
      (await uploadAndSign(
        'renders',
        path,
        Buffer.from(srt, 'utf8').toString('base64'),
        'application/x-subrip',
        WEEK_SEC,
      )) ?? null
    );
  } catch {
    return null;
  }
}
