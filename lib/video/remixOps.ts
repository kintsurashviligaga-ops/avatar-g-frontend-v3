/**
 * lib/video/remixOps.ts
 * =====================
 * Low-level, fail-open building blocks for the Video Remix flow (POST
 * /api/video/remix). Mirrors trimClip.ts: drive the bundled ffmpeg-static with
 * remote URLs as inputs, host the result, return the signed URL. Every helper
 * returns `null` on any miss (no ffmpeg, fetch/exec error, empty output) so the
 * route can degrade gracefully and the user is never left with a broken render.
 *
 * The generative leg (klingI2v) animates a single restyled/character-swapped
 * keyframe back into a clip via Replicate; kenBurnsClip is the pure-ffmpeg
 * fallback so restyle/character ALWAYS return a moving result even with no token.
 */
import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withRetry } from '@/lib/utils/withRetry';
import ffmpegStatic from 'ffmpeg-static';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

const exec = promisify(execFile);
const BIN = ffmpegStatic as unknown as string | null;

const X264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p'];

async function hostMp4(buf: Buffer, tag: string): Promise<string | null> {
  if (buf.byteLength < 1_024) return null;
  const path = `remix/${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
  return (await uploadAndSign('uploads', path, buf.toString('base64'), 'video/mp4', 604_800)) ?? null;
}

/**
 * Lay `audioUrl` over `videoUrl`.
 *  • mode 'replace' → drop the original audio, use the new track verbatim.
 *  • mode 'mix'     → keep the original ambience ducked `duckDb` under the new
 *                     track (voice-over feel). Falls back to 'replace' when the
 *                     source has no audio stream (amix would otherwise error).
 * `-shortest` keeps the output to the shorter of the two so a long VO never tails
 * past the picture.
 */
export async function muxAudioOntoVideo(
  videoUrl: string,
  audioUrl: string,
  mode: 'replace' | 'mix' = 'replace',
  duckDb = 10,
): Promise<string | null> {
  if (!BIN || !videoUrl || !audioUrl) return null;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'remix-mux-'));
    const out = join(dir, 'out.mp4');
    const replaceArgs = [
      '-y', '-i', videoUrl, '-i', audioUrl,
      '-map', '0:v:0', '-map', '1:a:0',
      ...X264, '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out,
    ];
    if (mode === 'mix') {
      const mixArgs = [
        '-y', '-i', videoUrl, '-i', audioUrl,
        '-filter_complex', `[0:a]volume=-${Math.max(0, duckDb)}dB[a0];[a0][1:a]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
        '-map', '0:v:0', '-map', '[aout]',
        ...X264, '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out,
      ];
      try {
        await exec(BIN, mixArgs, { maxBuffer: 1 << 26, timeout: 180_000 });
        const buf = await readFile(out);
        return await hostMp4(buf, 'mix');
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

const ASPECT_DIMS: Record<string, [number, number]> = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1': [1080, 1080],
};

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
    // Scale up (so zoompan has headroom), slow zoom to 1.15×, crop to the target.
    const vf = `scale=${w * 2}:${h * 2},zoompan=z='min(zoom+0.0010,1.15)':d=${frames}:s=${w}x${h}:fps=${fps},format=yuv420p`;
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

export type GradeStyle = 'vintage' | 'cinematic' | 'neon' | 'noir' | 'dramatic';
/** Per-style color-grade ffmpeg filter chains. `cinematic` is a proper Hollywood teal &
 *  orange (cool shadows + warm highlights), plus noir (high-contrast B&W) and dramatic. */
const GRADE_VF: Record<GradeStyle, string> = {
  vintage: 'curves=vintage',
  cinematic: 'colorbalance=rs=-0.08:bs=0.08:rh=0.08:bh=-0.08,eq=contrast=1.08:saturation=1.06,vignette=PI/5',
  neon: 'hue=s=2,eq=contrast=1.2:brightness=0.1',
  noir: 'hue=s=0,eq=contrast=1.25:brightness=-0.02,vignette=PI/4',
  dramatic: 'eq=contrast=1.2:saturation=0.96,vignette=PI/4',
};

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
 * Normalize a clip to an EXACT target aspect (9:16 / 16:9 / 1:1) at standard dims.
 * Kling i2v IGNORES aspect_ratio when a start_image is given (its output ratio = the
 * source photo's — verified in the Replicate schema), so Motion Control post-fits here.
 * Center-crop (fill): the clip is scaled up to COVER the target ratio and the overflow
 * is cropped, so the frame is fully filled with no bars (edges may be trimmed). Keeps
 * audio if present. Fail-open → null.
 */
export async function fitAspect(videoUrl: string, aspect: '9:16' | '16:9' | '1:1'): Promise<string | null> {
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
 * Change playback speed by `factor` (2 = 2× faster, 0.5 = half-speed). Video via
 * setpts; audio via atempo (chained so factors outside the 0.5–2.0 atempo window
 * still work). Clamped to a sane 0.25×–4× range.
 */
export async function changeSpeed(videoUrl: string, factor: number): Promise<string | null> {
  if (!BIN || !videoUrl) return null;
  const f = Math.max(0.25, Math.min(4, Number(factor) || 1));
  // atempo only accepts 0.5–2.0 per stage → decompose f into a product of in-range steps.
  const tempoSteps: number[] = [];
  let remaining = f;
  while (remaining > 2.0) { tempoSteps.push(2.0); remaining /= 2.0; }
  while (remaining < 0.5) { tempoSteps.push(0.5); remaining /= 0.5; }
  tempoSteps.push(remaining);
  const atempo = tempoSteps.map((s) => `atempo=${s.toFixed(4)}`).join(',');
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

// REAL video face-swap (roop): swap_image (new face) + target_video → the SAME video with
// the face replaced THROUGHOUT, preserving the original motion. This is the closer-to-source
// path the keyframe-regenerate `character` op can't give. Community model → pinned version
// via /v1/predictions (env-overridable). Bounded create+poll; result re-hosted to Supabase.
// Returns null on no-token / restriction / timeout so the caller falls back. ~9 min poll cap.
const FACESWAP_MODEL_VERSION = (process.env.REPLICATE_FACESWAP_VERSION || '11b6bf0f4e14d808f655e87e5448233cceff10a45f659d71539cafb7163b2e84').trim();
export async function roopFaceSwapVideo(targetVideoUrl: string, swapImageUrl: string): Promise<string | null> {
  const token = (process.env.REPLICATE_API_TOKEN || '').trim();
  if (!token || !targetVideoUrl || !swapImageUrl) return null;
  if (!/^https?:\/\//i.test(targetVideoUrl) || !/^https?:\/\//i.test(swapImageUrl)) return null; // replicate fetches by URL
  try {
    const create = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ version: FACESWAP_MODEL_VERSION, input: { swap_image: swapImageUrl, target_video: targetVideoUrl } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!create.ok) return null;
    const pred = (await create.json().catch(() => ({}))) as { status?: string; output?: unknown; urls?: { get?: string } };
    const pollUrl = pred.urls?.get;
    const pick = (o: unknown): string | null => typeof o === 'string' && /^https?:\/\//.test(o) ? o : Array.isArray(o) ? pick(o[o.length - 1]) : null;
    let output = pred.output;
    let status = pred.status;
    const deadline = Date.now() + 540_000;
    while (pollUrl && status !== 'succeeded' && status !== 'failed' && status !== 'canceled' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4_000));
      const poll = await fetch(pollUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (!poll || !poll.ok) continue;
      const j = (await poll.json().catch(() => ({}))) as { status?: string; output?: unknown };
      status = j.status; output = j.output;
    }
    const outUrl = status === 'succeeded' ? pick(output) : null;
    if (!outUrl) return null;
    // Re-host to Supabase (the replicate.delivery URL is short-lived + CSP-blocked in-app).
    const r = await fetch(outUrl, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (!r || !r.ok) return outUrl; // fail-open: return the provider URL if re-host fetch misses
    const buf = Buffer.from(await r.arrayBuffer());
    return (await hostMp4(buf, 'faceswap')) ?? outUrl;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.faceswap] failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

const I2V_MODEL = (process.env.REPLICATE_VIDEO_MODEL || 'kwaivgi/kling-v1.6-standard').trim();
const I2V_NEGATIVE = 'blurry, distorted, watermark, text, low quality, deformed';

/**
 * Animate a restyled / character-swapped keyframe back into a ~5s clip via the
 * configured Replicate i2v model (Kling by default), re-hosted to Supabase.
 * Returns null on no token / create / poll failure so the caller falls back to
 * kenBurnsClip. Self-contained create+poll (bounded to ~4 min).
 */
export async function klingI2v(startImage: string, prompt: string, aspect: '9:16' | '16:9' | '1:1' = '9:16', referenceImages?: string[]): Promise<string | null> {
  const token = (process.env.REPLICATE_API_TOKEN || '').trim();
  if (!token || !startImage) return null;
  try {
    const input: Record<string, unknown> = {
      start_image: startImage,
      prompt: `${prompt}, photorealistic, cinematic, natural lighting, sharp focus, 4k`,
      negative_prompt: I2V_NEGATIVE,
      duration: 5,
    };
    // Character-swap: kling-v1.6 accepts reference_images as an IDENTITY anchor — pass the
    // new-character photo so the re-animated clip carries that person's face/identity.
    const refs = (referenceImages ?? []).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u));
    if (refs.length) input.reference_images = refs;
    if (/v1\.6|v1-6|kling-v1/.test(I2V_MODEL.toLowerCase())) { input.aspect_ratio = aspect; input.cfg_scale = 0.5; }
    // One quick retry on a transient 5xx/network blip; a real timeout bails fast.
    const create = await withRetry(
      async () => {
        const r = await fetch(`https://api.replicate.com/v1/models/${I2V_MODEL}/predictions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ input }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!r.ok && r.status >= 500) throw new Error(`kling create ${r.status}`);
        return r;
      },
      { maxAttempts: 2, baseDelayMs: 800, label: 'remix-kling-i2v' },
    );
    if (!create.ok) return null;
    const pred = (await create.json().catch(() => ({}))) as { id?: string; status?: string; output?: unknown; urls?: { get?: string } };
    const pollUrl = pred.urls?.get;
    const pickUrl = (o: unknown): string | null =>
      typeof o === 'string' && /^https?:\/\//.test(o) ? o : Array.isArray(o) ? pickUrl(o[o.length - 1]) : null;
    let output = pred.output;
    let status = pred.status;
    const deadline = Date.now() + 240_000;
    while (pollUrl && status !== 'succeeded' && status !== 'failed' && status !== 'canceled' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3_000));
      const poll = await fetch(pollUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (!poll || !poll.ok) continue;
      const j = (await poll.json().catch(() => ({}))) as { status?: string; output?: unknown };
      status = j.status; output = j.output;
    }
    const providerUrl = status === 'succeeded' ? pickUrl(output) : null;
    if (!providerUrl) return null;
    // Re-host to a CSP-allowed Supabase URL so the <video> plays + the clip persists.
    const r = await fetch(providerUrl, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (!r || !r.ok) return providerUrl;
    const buf = Buffer.from(await r.arrayBuffer());
    return (await hostMp4(buf, 'i2v')) ?? providerUrl;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[remix.i2v] failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
