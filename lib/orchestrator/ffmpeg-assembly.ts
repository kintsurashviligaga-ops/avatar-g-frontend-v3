import 'server-only';

/**
 * CPU FFmpeg assembly fallback (Agent L, Option B).
 *
 * When no GPU RunPod worker is configured, the assemble route stitches the
 * composition itself on the Vercel node using the bundled `ffmpeg-static`
 * binary: download the clips + audio lanes → xfade-chain + ducked dual-track
 * mix (see ffmpeg-filtergraph) → H.264/AAC MP4 → upload to Supabase Storage →
 * return a signed URL. Slower + CPU-bound vs. the GPU worker (no 60fps
 * interpolation), but it makes the full 30s render work with zero extra infra.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { buildFilterComplex } from './ffmpeg-filtergraph';
import { uploadAndSign } from './storage-adapter';

const exec = promisify(execFile);
const RENDER_BUCKET = process.env.RENDER_BUCKET ?? 'renders';

export interface FfmpegManifest {
  segments: { url: string }[];
  voiceoverUrl?: string | null;
  musicUrl?: string | null;
  sfxUrl?: string | null;
  globalRender?: Record<string, string | number | boolean>;
  pipelineId?: string;
}

/** True when the CPU assembler can run (binary bundled). */
export function ffmpegAssemblyAvailable(): boolean {
  return Boolean(ffmpegStatic);
}

async function download(url: string, dest: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch(url, signal ? { signal } : {});
  if (!r.ok) throw new Error(`asset download failed (${r.status})`);
  await writeFile(dest, Buffer.from(await r.arrayBuffer()));
  return dest;
}

/**
 * Stitch the composition on this node.
 *
 * `signal` (optional) makes every blocking phase — clip/audio downloads and the
 * FFmpeg exec — abortable. The assemble route's atomic dispatch deadline passes
 * it so a render that stalls (a clip URL that never resolves, an exec that hangs
 * at ~38%) is cancelled promptly instead of pinning the function until the
 * platform hard-kills it — which would skip the saga compensation and strand the
 * user's reserved slot/credits.
 */
export async function assembleWithFfmpeg(m: FfmpegManifest, signal?: AbortSignal): Promise<{ url: string }> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) throw new Error('ffmpeg binary unavailable');

  const segs = (m.segments ?? []).filter(s => s?.url);
  if (segs.length < 1) throw new Error('no segments to assemble');

  const dir = await mkdtemp(join(tmpdir(), 'asm_'));
  try {
    const inputs: string[] = [];
    for (let i = 0; i < segs.length; i++) {
      inputs.push(await download(segs[i]!.url, join(dir, `seg${i}.mp4`), signal));
    }
    const voice = m.voiceoverUrl ? await download(m.voiceoverUrl, join(dir, 'voice.m4a'), signal) : null;
    const music = m.musicUrl ? await download(m.musicUrl, join(dir, 'music.m4a'), signal) : null;
    const sfx = m.sfxUrl ? await download(m.sfxUrl, join(dir, 'sfx.m4a'), signal) : null;

    const g = m.globalRender ?? {};
    const fps = String(g.fps) === '60' ? 60 : 24;
    const duckPct = typeof g.vocal_ducking_pct === 'number' ? g.vocal_ducking_pct : 30;
    const transition = String(g.transition ?? 'crossfade');

    const { filter, vmap, amap } = buildFilterComplex({
      nClips: inputs.length,
      hasVoice: Boolean(voice),
      hasMusic: Boolean(music),
      hasSfx: Boolean(sfx),
      fps,
      duckPct,
      transition,
    });

    const out = join(dir, 'master.mp4');
    const args: string[] = ['-y'];
    for (const p of inputs) args.push('-i', p);
    for (const a of [voice, music, sfx]) if (a) args.push('-i', a);
    args.push('-filter_complex', filter, '-map', vmap);
    if (amap) args.push('-map', amap);
    args.push(
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out,
    );

    await exec(bin, args, { maxBuffer: 1 << 28, timeout: 280_000, ...(signal ? { signal } : {}) });

    const data = await readFile(out);
    const objectPath = `${m.pipelineId || 'render'}/${Date.now()}.mp4`;
    const url = await uploadAndSign(RENDER_BUCKET, objectPath, data.toString('base64'), 'video/mp4');
    if (!url) throw new Error('master upload failed (Supabase Storage not configured)');
    return { url };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
