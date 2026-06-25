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

/** Per-style color-grade ffmpeg filter chains (the spec's vintage / cinematic / neon). */
const GRADE_VF: Record<'vintage' | 'cinematic' | 'neon', string> = {
  vintage: 'curves=vintage',
  cinematic: 'eq=contrast=1.1:saturation=0.9,vignette',
  neon: 'hue=s=2,eq=contrast=1.2:brightness=0.1',
};

/** Apply a cinematic color grade (vintage / cinematic / neon) — keeps the audio. */
export async function colorGrade(videoUrl: string, style: 'vintage' | 'cinematic' | 'neon'): Promise<string | null> {
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

const I2V_MODEL = (process.env.REPLICATE_VIDEO_MODEL || 'kwaivgi/kling-v1.6-standard').trim();
const I2V_NEGATIVE = 'blurry, distorted, watermark, text, low quality, deformed';

/**
 * Animate a restyled / character-swapped keyframe back into a ~5s clip via the
 * configured Replicate i2v model (Kling by default), re-hosted to Supabase.
 * Returns null on no token / create / poll failure so the caller falls back to
 * kenBurnsClip. Self-contained create+poll (bounded to ~4 min).
 */
export async function klingI2v(startImage: string, prompt: string, aspect: '9:16' | '16:9' | '1:1' = '9:16'): Promise<string | null> {
  const token = (process.env.REPLICATE_API_TOKEN || '').trim();
  if (!token || !startImage) return null;
  try {
    const input: Record<string, unknown> = {
      start_image: startImage,
      prompt: `${prompt}, photorealistic, cinematic, natural lighting, sharp focus, 4k`,
      negative_prompt: I2V_NEGATIVE,
      duration: 5,
    };
    if (/v1\.6|v1-6|kling-v1/.test(I2V_MODEL.toLowerCase())) { input.aspect_ratio = aspect; input.cfg_scale = 0.5; }
    const create = await fetch(`https://api.replicate.com/v1/models/${I2V_MODEL}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(30_000),
    });
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
