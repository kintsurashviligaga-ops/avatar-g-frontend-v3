/**
 * lib/video/remixOps.ts
 * =====================
 * Low-level, fail-open building blocks for the Video Remix flow (POST
 * /api/video/remix). Mirrors trimClip.ts: drive the bundled ffmpeg-static with
 * remote URLs as inputs, host the result, return the signed URL. Every helper
 * returns `null` on any miss (no ffmpeg, fetch/exec error, empty output) so the
 * route can degrade gracefully and the user is never left with a broken render.
 *
 * Nothing here calls a generative provider (MASTER TASK v3.1): the Replicate legs — the roop face swap
 * and the Kling i2v that animated a restyled keyframe — had no caller left and are gone. kenBurnsClip is
 * the pure-ffmpeg pan the product ad falls back to when Veo misses (lib/ai/veoClipSync).
 */
import 'server-only';
import { ffmpegExec } from '@/lib/video/ffmpegExec';
import { ASPECT_DIMS as SHARED_ASPECT_DIMS, GRADE_VF, atempoChain, type GradeStyle } from '@/lib/video/editFilters';
import { soundMixGraph } from '@/lib/services/montage/montageSound';
import { describeDub, dubFilter, frameLevelsDb, levelProfile, planDub, speechSpans } from '@/lib/avatar/speechMatch';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
// The pipeline's SVG→PNG overlay compositor — the one text path that renders on Vercel (no system
// fonts, and ffmpeg-static is built without libfreetype, so `drawtext` does not exist there).
import { applyMarketingOverlays } from '@/lib/pipeline/compositing/ffmpeg-overlay';

/** ffmpeg never fetches a URL itself: http(s) inputs are downloaded through the public-fetch guard first. */
const exec = ffmpegExec;
const BIN = ffmpegStatic as unknown as string | null;

const X264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p'];

/**
 * Host a finished clip.
 *
 * ⚠️ USES uploadBufferAndSign, NOT uploadAndSign — the same fix, for the same reason, as
 * lib/video/surgicalOps.ts `host()`. uploadAndSign takes BASE64, so this used to hold the buffer, a
 * 1.33x base64 string built from it, and the adapter's decoded copy of that string all at once —
 * roughly 3.3x the clip's size in a memory-bounded lambda, which is how large exports died with no
 * error at all. The buffer path uploads the bytes directly and retries once on a transient failure.
 */
async function hostMp4(buf: Buffer, tag: string): Promise<string | null> {
  if (buf.byteLength < 1_024) return null;
  const path = `remix/${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
  return (await uploadBufferAndSign('renders', path, buf, 'video/mp4', 604_800)) ?? null;
}

/**
 * Lay `audioUrl` over `videoUrl`.
 *  • mode 'replace' → drop the original audio, use the new track verbatim.
 *  • mode 'mix'     → keep the original ambience ducked `duckDb` under the new
 *                     track (voice-over feel). Falls back to 'replace' when the
 *                     source has no audio stream (amix would otherwise error).
 *  • mode 'under'   → the INVERSE of 'mix': the clip's OWN audio leads and the new
 *                     track sits `duckDb` under it. This is the mode for laying a
 *                     music bed under a clip that already carries sound — a Veo clip
 *                     speaks its dialogue in-clip, and 'replace' would delete it
 *                     (the multi-clip stitch preserves that audio via its diegetic
 *                     lane, so the single-clip path has to as well). Same fallback:
 *                     a silent source errors out and lands on a clean 'replace'.
 * `-shortest` keeps the output to the shorter of the two so a long VO never tails
 * past the picture.
 */
/**
 * Can this source's video stream be stream-COPIED into MP4 and still play exactly as the X264 pass
 * would have played it? Requires H.264, 8-bit 4:2:0, and NO rotation display-matrix (autorotation is
 * baked in by a re-encode but only carried as metadata by a copy, so a rotated phone clip keeps the
 * proven re-encode). Anything else — HEVC, VP9, 10-bit, 4:2:2/4:4:4 — returns false. One header-only
 * `ffmpeg -i` read (no decode, ~1 round trip) decides whether a full re-encode is needed at all.
 */
async function videoStreamIsMp4Copyable(url: string): Promise<boolean> {
  if (!BIN) return false;
  try {
    // `-i` with no output prints the stream list to stderr then exits non-zero → the catch has it.
    await exec(BIN, ['-hide_banner', '-i', url], { maxBuffer: 1 << 22, timeout: 30_000 });
    return false;
  } catch (e) {
    const log = String((e as { stderr?: string })?.stderr ?? '');
    if (/displaymatrix|rotation of/i.test(log)) return false; // autorotation must stay baked in
    const m = /Stream #\d+:\d+[^\n]*: Video: ([^\n]*)/.exec(log);
    if (!m || !m[1]) return false;
    return /^h264\b/.test(m[1].trim()) && /\byuv420p\b/.test(m[1]);
  }
}

/**
 * The two inputs every mux branch opens: the picture, then the incoming track. `audioStartSec` > 0 seeks INTO the
 * track — `-ss` before its `-i` is input seeking, so the song's 0:42 lands on the picture's first frame (Montage's
 * „start the music at"). 0, absent or garbage adds nothing, so the argv is byte-for-byte what it was without it.
 */
function muxInputs(videoUrl: string, audioUrl: string, audioStartSec: number): string[] {
  const seek = Number.isFinite(audioStartSec) && audioStartSec > 0 ? ['-ss', String(Number(audioStartSec.toFixed(3)))] : [];
  return ['-y', '-i', videoUrl, ...seek, '-i', audioUrl];
}

export async function muxAudioOntoVideo(
  videoUrl: string,
  audioUrl: string,
  mode: 'replace' | 'mix' | 'under' | 'bed' = 'replace',
  duckDb = 10,
  /** Seconds into `audioUrl` to start from (input seeking on the track only). 0 = the top, as before. */
  audioStartSec = 0,
): Promise<string | null> {
  if (!BIN || !videoUrl || !audioUrl) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'remix-mux-'));
    const out = join(dir, 'out.mp4');
    const inputs = muxInputs(videoUrl, audioUrl, audioStartSec);
    // ONLY THE AUDIO CHANGES HERE, so the picture is stream-COPIED whenever the source allows it.
    // Re-encoding a master we did not touch costs a full x264 pass over every frame (a 3-minute 1080p
    // montage master is ~45-90s of lambda CPU), adds a generation of loss, and re-inflates a file that
    // renderConcat deliberately VBV-capped to fit the storage limit. The old dubbing mux always copied for
    // exactly this reason. The probe keeps the OUTPUT identical in codec, pixel
    // format and orientation: anything not already H.264 8-bit 4:2:0 and unrotated takes X264 as before.
    const vcodec = (await videoStreamIsMp4Copyable(videoUrl)) ? ['-c:v', 'copy'] : X264;
    const replaceArgs = [
      ...inputs,
      '-map', '0:v:0', '-map', '1:a:0',
      ...vcodec, '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out,
    ];
    if (mode === 'bed') {
      // The incoming track takes over the audio but never decides the LENGTH. Plain 'replace' ends on whichever
      // stream is shorter, so a 30 s song cut a 60 s edit in half. Here the song is mixed over the source's own
      // track (a montage master always has one — silence where every shot is muted) with `duration=first`, so
      // the picture's length wins, and `normalize=0` keeps the song at full level instead of amix's halving.
      // (`apad` + `-shortest` does the same on paper, and with the picture stream-copied it never terminates.)
      try {
        await exec(BIN, [
          ...inputs,
          '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]',
          '-map', '0:v:0', '-map', '[aout]',
          ...vcodec, '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out,
        ], { maxBuffer: 1 << 26, timeout: 180_000 });
        const buf = await readFile(out);
        return await hostMp4(buf, 'bed');
      } catch {
        // No source audio track to mix over → fall through to a clean replace.
      }
    }
    if (mode === 'mix' || mode === 'under') {
      const db = Math.max(0, duckDb);
      // 'mix' ducks the SOURCE under the incoming track; 'under' ducks the INCOMING track under the
      // source. Both keep the two lanes; only which one leads differs.
      const graph = mode === 'mix'
        ? `[0:a]volume=-${db}dB[a0];[a0][1:a]amix=inputs=2:duration=first:dropout_transition=0[aout]`
        : `[1:a]volume=-${db}dB[a1];[0:a][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
      const mixArgs = [
        ...inputs,
        '-filter_complex', graph,
        '-map', '0:v:0', '-map', '[aout]',
        ...vcodec, '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out,
      ];
      try {
        await exec(BIN, mixArgs, { maxBuffer: 1 << 26, timeout: 180_000 });
        const buf = await readFile(out);
        return await hostMp4(buf, mode);
      } catch {
        // Source likely has no audio track → fall through to a clean replace.
      }
    }
    await exec(BIN, replaceArgs, { maxBuffer: 1 << 26, timeout: 180_000 });
    const buf = await readFile(out);
    return await hostMp4(buf, 'dub');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.mux] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The talking avatar's ElevenLabs line laid over its Veo clip (lib/avatar/veoAvatar, GG's ElevenLabs choice 2026-10-17).
 * Veo SAID the line itself (in Latin letters, GG's tap 10:22Z „Veo ლაპარაკობს"), so its mouth follows its own voice:
 * that voice is dropped and the line, cut at its pauses, is laid phrase by phrase onto where Veo spoke
 * (lib/avatar/speechMatch). A clip with no voice of its own (the silent clips before) gets the line from its start.
 * Unlike 'replace' above, the PICTURE decides the length: a 3 s line under an 8 s clip is padded with silence to
 * `seconds` (`apad=whole_dur`), never the clip cut to 3 s by `-shortest`; a line a hair longer than the clip ends with
 * it (`-t`). The picture is stream-copied when it can be. Hosted at `dest` — a fixed path, so a repeat poll re-signs
 * one object instead of muxing again. Null on any miss.
 */
export async function muxVoiceOntoClip(
  videoUrl: string,
  voiceUrl: string,
  seconds: number,
  dest: { bucket: string; path: string },
  opts: { keepBed?: boolean } = {},
): Promise<string | null> {
  if (!BIN || !videoUrl || !voiceUrl || !(seconds > 0)) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'avatar-voice-'));
    const out = join(dir, 'out.mp4');
    const vcodec = (await videoStreamIsMp4Copyable(videoUrl)) ? ['-c:v', 'copy'] : X264;
    const sec = String(Number(seconds.toFixed(3)));
    const line = await speechLevels(BIN, voiceUrl, join(dir, 'line.pcm'));
    const veo = await speechLevels(BIN, videoUrl, join(dir, 'veo.pcm'));
    const lineSpans = line ? speechSpans(line) : [];
    const veoSpans = veo ? speechSpans(veo) : [];
    const pieces = planDub(lineSpans, veoSpans, seconds);
    // eslint-disable-next-line no-console
    console.warn('[avatar.voice] dub:', describeDub(lineSpans, veoSpans, pieces), '| veo dB/0.5s', veo ? levelProfile(veo) : 'none');
    const voiceGraph = pieces ? dubFilter(pieces, '1:a', seconds) : `[1:a]apad=whole_dur=${sec}[voice]`;
    const run = (graph: string, label: string) => exec(BIN!, [
      '-y', '-i', videoUrl, '-i', voiceUrl,
      '-filter_complex', graph,
      '-map', '0:v:0', '-map', `[${label}]`,
      ...vcodec, '-c:a', 'aac', '-b:a', '192k', '-t', sec, '-movflags', '+faststart', out,
    ], { maxBuffer: 1 << 26, timeout: 90_000 });
    // The direct clip keeps Veo's own sound (the scene the prompt asked for) with only its speech taken out — when the
    // line was matched to where Veo spoke. Unmatched, Veo's voice could be anywhere, so it goes whole, as for the avatar.
    const bed = opts.keepBed && pieces ? bedWithoutSpeech(veoSpans, seconds) : null;
    if (bed) {
      try {
        await run(`${voiceGraph};${bed}`, 'aout');
      } catch {
        await run(voiceGraph, 'voice'); // no audio track of its own to keep
      }
    } else {
      await run(voiceGraph, 'voice');
    }
    const buf = await readFile(out);
    if (buf.byteLength < 1_024) return null;
    return await uploadBufferAndSign(dest.bucket, dest.path, buf, 'video/mp4', 604_800);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[avatar.voice] mux failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Veo's own track with its speech spans silenced (a little either side, so no syllable's edge is left), mixed under the
 * dubbed line `[voice]`, as `[aout]`. Null when Veo said nothing we could find.
 */
function bedWithoutSpeech(veoSpans: readonly { start: number; end: number }[], seconds: number): string | null {
  if (veoSpans.length === 0) return null;
  const PAD = 0.08;
  const sec = String(Number(seconds.toFixed(3)));
  const spans = veoSpans.map((s) => `between(t,${Math.max(0, s.start - PAD).toFixed(3)},${(s.end + PAD).toFixed(3)})`).join('+');
  return `[0:a]volume=volume=0:enable='${spans}',volume=0.8[bed];[bed][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,apad=whole_dur=${sec}[aout]`;
}

/**
 * A track's levels (lib/avatar/speechMatch), read from its first audio stream as 16 kHz mono in the voice band (120 Hz
 * to 4 kHz, so a bass line or a hum under Veo's words does not read as speech); null when it has none.
 */
async function speechLevels(bin: string, url: string, pcmPath: string): Promise<number[] | null> {
  try {
    await exec(bin, ['-y', '-v', 'error', '-i', url, '-map', '0:a:0', '-af', 'highpass=f=120,lowpass=f=4000', '-ac', '1', '-ar', '16000', '-f', 's16le', pcmPath], { maxBuffer: 1 << 24, timeout: 60_000 });
    const buf = await readFile(pcmPath);
    if (buf.byteLength < 320) return null;
    const pcm = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
    return frameLevelsDb(pcm, 16_000);
  } catch {
    return null;
  }
}

/**
 * Agent G's montage sound in one pass (lib/services/montage/montageSound): the master's own track, a music bed from
 * `musicStartSec` at `musicGainDb`, and a narration from `voiceStartSec` that the rest steps back under. The picture is
 * stream-copied whenever it can be (see muxAudioOntoVideo). Null on any failure: the caller fails the job, since a
 * montage without the sound it was quoted with is not the edit the user started.
 */
export async function mixMontageSound(
  videoUrl: string,
  o: { musicUrl?: string; musicStartSec?: number; musicGainDb?: number; voiceUrl?: string; voiceStartSec?: number },
): Promise<string | null> {
  if (!BIN || !videoUrl || (!o.musicUrl && !o.voiceUrl)) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'remix-sound-'));
    const out = join(dir, 'out.mp4');
    const { graph, out: label } = soundMixGraph({
      ...(o.musicUrl ? { music: { gainDb: o.musicGainDb ?? 0 } } : {}),
      ...(o.voiceUrl ? { voice: { atSec: o.voiceStartSec ?? 0 } } : {}),
    });
    const seek = o.musicStartSec && o.musicStartSec > 0 ? ['-ss', String(Number(o.musicStartSec.toFixed(3)))] : [];
    const vcodec = (await videoStreamIsMp4Copyable(videoUrl)) ? ['-c:v', 'copy'] : X264;
    await exec(BIN, [
      '-y', '-i', videoUrl,
      ...(o.musicUrl ? [...seek, '-i', o.musicUrl] : []),
      ...(o.voiceUrl ? ['-i', o.voiceUrl] : []),
      '-filter_complex', graph, '-map', '0:v:0', '-map', `[${label}]`,
      ...vcodec, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out,
    ], { maxBuffer: 1 << 26, timeout: 180_000 });
    return await hostMp4(await readFile(out), o.voiceUrl ? 'voice' : 'sound');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.sound] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Grab one frame at `atSec` as a base64 JPEG data URL — the anchor the image
 * model restyles / swaps a character into before re-animation.
 */
export async function extractFrame(videoUrl: string, atSec = 0.5): Promise<string | null> {
  if (!BIN || !videoUrl) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'remix-frame-'));
    const out = join(dir, 'frame.jpg');
    await exec(BIN, [
      '-y', '-ss', String(Math.max(0, atSec)), '-i', videoUrl,
      '-frames:v', '1', '-q:v', '3', out,
    ], { maxBuffer: 1 << 26, timeout: 60_000 });
    const buf = await readFile(out);
    if (buf.byteLength < 512) return null;
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.frame] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const ASPECT_DIMS: Readonly<Record<string, readonly [number, number]>> = SHARED_ASPECT_DIMS;

/**
 * Pre-fit a product image (data: URL) to the target aspect so Kling i2v — whose output ratio
 * FOLLOWS the start image — renders NATIVE 9:16 instead of a square that later needs padding.
 * `cover` fills the frame (centre), which suits a hero product; fail-open → returns the input.
 */
export async function fitImageToAspect(dataUrl: string, aspect: '9:16' | '16:9' | '1:1'): Promise<string> {
  try {
    if (!/^data:image\//i.test(dataUrl)) return dataUrl;
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : '';
    if (!b64) return dataUrl;
    const [w, h] = ASPECT_DIMS[aspect] ?? ASPECT_DIMS['9:16']!;
    const sharp = (await import('sharp')).default;
    const out = await sharp(Buffer.from(b64, 'base64'))
      .resize(w, h, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 88 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch {
    return dataUrl; // fail-open: Kling still runs on the original image
  }
}

/**
 * Ken-Burns a still image into a `durationSec` clip (slow zoom). The reliable
 * fallback for restyle/character when no i2v token is configured, so the user
 * always gets a moving, restyled result. `image` may be a data: URL or https.
 */
export async function kenBurnsClip(image: string, durationSec = 5, aspect: '9:16' | '16:9' | '1:1' = '9:16'): Promise<string | null> {
  if (!BIN || !image) return null;
  const [w, h] = ASPECT_DIMS[aspect] ?? ASPECT_DIMS['9:16']!;
  const fps = 30;
  const frames = Math.max(30, Math.round(durationSec * fps));
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'remix-kb-'));
    // A data: URL can't be an ffmpeg input path → write it to a temp file first.
    let input = image;
    if (image.startsWith('data:')) {
      const b64 = image.includes(',') ? image.split(',')[1] ?? '' : '';
      if (!b64) return null;
      input = join(dir, 'still.jpg');
      await writeFile(input, Buffer.from(b64, 'base64'));
    }
    const out = join(dir, 'kb.mp4');
    // Cover the target frame at 2× (so zoompan has headroom) WITHOUT stretching: scale up until it covers, crop the
    // overflow from the middle, the way every clip is fitted (fitAspect). Then a slow zoom to 1.15× into the centre.
    // ⚠️ It used to be a bare `scale=${w*2}:${h*2}`: a square product photo in a 9:16 edit came out squashed. The first
    // frame is now the photo exactly as fitted, which the montage's per-photo QC relies on (agent/media/montageAsk).
    const vf = `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},`
      + `zoompan=z='min(zoom+0.0010,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps},format=yuv420p`;
    await exec(BIN, [
      '-y', '-loop', '1', '-i', input, '-t', String(durationSec),
      '-vf', vf, ...X264, '-movflags', '+faststart', out,
    ], { maxBuffer: 1 << 26, timeout: 120_000 });
    const buf = await readFile(out);
    return await hostMp4(buf, 'kenburns');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.kenburns] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export type { GradeStyle };


/** Apply a cinematic color grade (vintage / cinematic / neon / noir / dramatic) — keeps the audio. */
export async function colorGrade(videoUrl: string, style: GradeStyle): Promise<string | null> {
  if (!BIN || !videoUrl) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'remix-grade-'));
    const out = join(dir, 'out.mp4');
    await exec(BIN, [
      '-y', '-i', videoUrl, '-vf', GRADE_VF[style] ?? GRADE_VF.cinematic,
      ...X264, '-c:a', 'copy', '-movflags', '+faststart', out,
    ], { maxBuffer: 1 << 26, timeout: 180_000 });
    const buf = await readFile(out);
    return await hostMp4(buf, `grade-${style}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.grade] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Normalize a clip to an EXACT target aspect (9:16 / 16:9 / 1:1 / 4:5) at standard dims.
 * Kling i2v IGNORES aspect_ratio when a start_image is given (its output ratio = the
 * source photo's — verified in the Replicate schema), so Motion Control post-fits here.
 * Center-crop (fill): the clip is scaled up to COVER the target ratio and the overflow
 * is cropped, so the frame is fully filled with no bars (edges may be trimmed). Keeps
 * audio if present. Fail-open → null.
 */
export async function fitAspect(videoUrl: string, aspect: '9:16' | '16:9' | '1:1' | '4:5'): Promise<string | null> {
  if (!BIN || !videoUrl) return null;
  const [w, h] = ASPECT_DIMS[aspect] ?? ASPECT_DIMS['9:16']!;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'remix-fit-'));
    const out = join(dir, 'out.mp4');
    // CENTER-CROP (fill): scale up to COVER the target then crop the overflow → the
    // whole 9:16/1:1/16:9 frame is filled, no bars (edges may be cut). Kept as a SIMPLE
    // -vf graph, NOT -filter_complex: ffmpeg auto-applies a clip's rotation display-matrix
    // only for simple filtergraphs (-filter_complex DISABLES autorotation, which baked
    // Kling clips that carry a rotate flag in sideways — the "video rotated 90°" report).
    const vf =
      `scale=${w}:${h}:force_original_aspect_ratio=increase,` +
      `crop=${w}:${h},format=yuv420p`;
    // `-c:a copy` is a no-op for the silent Kling clip and preserves audio if present.
    await exec(BIN, [
      '-y', '-i', videoUrl, '-vf', vf,
      ...X264, '-c:a', 'copy', '-movflags', '+faststart', out,
    ], { maxBuffer: 1 << 26, timeout: 180_000 });
    const buf = await readFile(out);
    return await hostMp4(buf, `fit-${aspect.replace(':', 'x')}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.fit] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Crop a Gemini-API Veo clip's visible bottom watermark band (audio copied through). `videoUrl` is anything ffmpeg
 * reads — an https URL or a local file. `dest` hosts the result at a FIXED storage path instead of a fresh random
 * one, so a caller that may run twice for the same clip (the film poll re-polls finished clips every tick) lands on
 * the same object instead of minting a new copy each time.
 */
export async function stripBottomWatermark(
  videoUrl: string,
  aspect: '9:16' | '16:9' | '1:1' = '16:9',
  pct?: number,
  dest?: { bucket: string; path: string },
): Promise<string | null> {
  if (!BIN || !videoUrl) return null;
  const rawPct = Number.isFinite(pct) ? (pct as number) : Number(process.env.VEO_WATERMARK_CROP_PCT || 8);
  const p = Math.min(20, Math.max(0, rawPct)) / 100; // clamp 0–20%; 0 → nothing to strip
  if (p <= 0) return videoUrl;
  const [w, h] = ASPECT_DIMS[aspect] ?? ASPECT_DIMS['16:9']!;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'veo-wm-'));
    const out = join(dir, 'out.mp4');
    // Simple -vf graph (keeps ffmpeg's autorotation): crop off the bottom band (rounded to an even height),
    // then cover-fit back to the aspect's WxH so the output size/aspect is unchanged. Audio copied through so
    // a Veo clip's native speech/effects survive. Removes only a VISIBLE bottom mark — the invisible SynthID
    // is forensic and deliberately untouched.
    const vf =
      `crop=iw:floor(ih*${(1 - p).toFixed(4)}/2)*2:0:0,` +
      `scale=${w}:${h}:force_original_aspect_ratio=increase,` +
      `crop=${w}:${h},format=yuv420p`;
    await exec(BIN, [
      '-y', '-i', videoUrl, '-vf', vf,
      ...X264, '-c:a', 'copy', '-movflags', '+faststart', out,
    ], { maxBuffer: 1 << 26, timeout: 180_000 });
    const buf = await readFile(out);
    if (dest) return buf.byteLength < 1_024 ? null : await uploadBufferAndSign(dest.bucket, dest.path, buf, 'video/mp4', 604_800);
    return await hostMp4(buf, 'veo-clean');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.watermark] strip failed → keeping original:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Change playback speed by `factor` (2 = 2× faster, 0.5 = half-speed). Video via
 * setpts; audio via atempo (chained so factors outside the 0.5–2.0 atempo window
 * still work). Clamped to a sane 0.25×–4× range.
 */
export async function changeSpeed(videoUrl: string, factor: number): Promise<string | null> {
  if (!BIN || !videoUrl) return null;
  const f = Math.max(0.25, Math.min(4, Number(factor) || 1));
  // atempo only accepts 0.5–2.0 per stage → a product of in-range stages (lib/video/editFilters).
  const atempo = atempoChain(f);
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'remix-speed-'));
    const out = join(dir, 'out.mp4');
    await exec(BIN, [
      '-y', '-i', videoUrl,
      '-filter_complex', `[0:v]setpts=${(1 / f).toFixed(4)}*PTS[v];[0:a]${atempo}[a]`,
      '-map', '[v]', '-map', '[a]',
      ...X264, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out,
    ], { maxBuffer: 1 << 26, timeout: 180_000 });
    let buf = await readFile(out).catch(() => null);
    if (!buf) {
      // Source may have no audio → retry video-only.
      await exec(BIN, ['-y', '-i', videoUrl, '-filter_complex', `[0:v]setpts=${(1 / f).toFixed(4)}*PTS[v]`, '-map', '[v]', ...X264, '-an', '-movflags', '+faststart', out], { maxBuffer: 1 << 26, timeout: 180_000 });
      buf = await readFile(out);
    }
    return await hostMp4(buf, 'speed');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.speed] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Probe a media duration (s) by parsing ffmpeg -i stderr. `ffmpeg -i` with no output exits
// non-zero, so the duration is read off the THROWN error's stderr. Returns 0 on a miss.
async function probeDurationSec(url: string): Promise<number> {
  if (!BIN) return 0;
  try {
    await exec(BIN, ['-i', url], { timeout: 30_000 });
    return 0;
  } catch (e) {
    const stderr = String((e as { stderr?: string })?.stderr ?? '');
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]!);
  }
}

/**
 * TASK 2 — cinematic SPEED RAMP: slow-in (first 20%), full speed (middle), slow-out
 * (last 20%) via a piecewise setpts. Video-only (the original audio cannot stay synced to
 * a variable-speed video, and ramps are scored with music anyway) → muted output. `factor`
 * (>1) is how much the ends are slowed (1.5 default). Fail-open → null.
 */
export async function changeSpeedRamp(videoUrl: string, factor = 1.5): Promise<string | null> {
  if (!BIN || !videoUrl) return null;
  const f = Math.max(1.05, Math.min(4, Number(factor) || 1.5));
  const dur = await probeDurationSec(videoUrl);
  if (dur <= 0) return changeSpeed(videoUrl, 1 / f); // no duration → graceful uniform slow-mo
  const a = (0.2 * dur).toFixed(3);
  const b = (0.8 * dur).toFixed(3);
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'remix-ramp-'));
    const out = join(dir, 'out.mp4');
    // T = presentation timestamp (s): slow the head + tail by `f`, keep the middle at 1x.
    const expr = `if(lt(T,${a}),${f.toFixed(3)}*PTS,if(gt(T,${b}),${f.toFixed(3)}*PTS,PTS))`;
    await exec(BIN, ['-y', '-i', videoUrl, '-filter_complex', `[0:v]setpts='${expr}'[v]`, '-map', '[v]', ...X264, '-an', '-movflags', '+faststart', out], { maxBuffer: 1 << 26, timeout: 180_000 });
    const buf = await readFile(out);
    return await hostMp4(buf, 'ramp');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.ramp] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * TASK 2 — VIDEO STABILIZATION via the single-pass `deshake` filter (+ a light unsharp).
 * We use `deshake`, NOT vidstab: this ffmpeg-static build's vid.stab has a serialization
 * bug ("Cannot parse localmotion!") that makes the two-pass detect→transform unusable;
 * deshake needs no transforms file and works reliably. Audio is copied through; fail-open
 * → null (the caller keeps the shaky original — never a hard error).
 */
export async function stabilizeClip(videoUrl: string): Promise<string | null> {
  if (!BIN || !videoUrl) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'remix-stab-'));
    const out = join(dir, 'out.mp4');
    // deshake rx/ry MUST be a multiple of 16 (else "rx must be a multiple of 16").
    const stabVf = 'deshake=rx=32:ry=32:edge=clamp,unsharp=5:5:0.6:3:3:0.3';
    let buf = await exec(BIN, ['-y', '-i', videoUrl, '-vf', stabVf, ...X264, '-c:a', 'copy', '-movflags', '+faststart', out], { maxBuffer: 1 << 26, timeout: 180_000 }).then(() => readFile(out)).catch(() => null);
    if (!buf) {
      // Source may have no audio → retry video-only.
      await exec(BIN, ['-y', '-i', videoUrl, '-vf', stabVf, ...X264, '-an', '-movflags', '+faststart', out], { maxBuffer: 1 << 26, timeout: 180_000 });
      buf = await readFile(out);
    }
    return await hostMp4(buf, 'stab');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.stabilize] failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** The free-tier brand mark. Latin, so it reads the same in every locale, and set uppercase by the
 *  renderer's own casing rule. */
export const WATERMARK_TEXT = 'MYAVATAR.GE';

/**
 * Burn the MyAvatar mark into the bottom-left of a clip — the lower-third band: a left→right fading
 * scrim, the cyan accent bar, then MYAVATAR.GE in tracked white caps.
 *
 * ⚠️ IT DRAWS TEXT, NOT AN IMAGE ASSET, AND THAT IS THE WHOLE POINT. The previous version overlaid
 * `public/logo.png` in the bottom-RIGHT corner — a file that is a JPEG wearing a .png name (`mjpeg /
 * yuvj420p`, no alpha), so it burnt an opaque dark rectangle onto every clip. Rendering the mark means
 * there is no asset to be the wrong format, no alpha to lose, and no file to fall out of the bundle.
 *
 * ⚠️ IT REUSES THE PIPELINE'S OWN OVERLAY RENDERER rather than a second implementation. resvg with the
 * FiraGO buffers is the only text path that works on Vercel — the container ships no system fonts and
 * ffmpeg-static is built WITHOUT libfreetype, so `drawtext` does not exist there at all. Measured against
 * a real production master: `buildOverlaySvg({ overlayText: 'MYAVATAR.GE' }, 720, 1136)` reproduces it
 * exactly — band top at y=1027 in both, accent bar 4px at x=36, cap height 22px.
 *
 * ⚠️ THE COUNTERPART TO stripVeoWatermark ABOVE, AND THEY MUST NOT FIGHT. That one crops the provider's
 * mark off the bottom of the frame; this one adds OURS afterwards. Run in the other order and the crop
 * removes the brand mark that was just applied — so watermarking belongs at the END of a pipeline, after
 * every crop, scale and concat has happened.
 *
 * ⚠️ WHO GETS MARKED IS NOT DECIDED HERE. Call `shouldWatermark(userId)` (lib/billing/entitlements) —
 * never a flag off a request body.
 *
 * Fail-open: any error returns null and the caller keeps the unmarked clip. A missing mark must never
 * lose someone the render they paid for.
 */
export async function addWatermark(videoUrl: string): Promise<string | null> {
  if (!BIN) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'wm-'));
    const out = join(dir, 'out.mp4');
    // applyMarketingOverlays probes the real pixel dimensions off `ffmpeg -i` stderr (there is no
    // ffprobe in ffmpeg-static) and renders the band at that exact size, so it lands pixel-for-pixel on
    // a 9:16 phone clip and a 16:9 master alike. It accepts a URL as the input path.
    const res = await applyMarketingOverlays(videoUrl, out, { overlayText: WATERMARK_TEXT, lang: 'en' });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[remix.watermark] overlay failed → keeping original:', res.error);
      return null;
    }
    const buf = await readFile(out);
    return await hostMp4(buf, 'wm');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.watermark] add failed → keeping original:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
