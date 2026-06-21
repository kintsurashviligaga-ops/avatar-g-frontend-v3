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
import { validateMaster, expectedMasterDuration, type QaReport } from './masterQa';
import { uploadAndSign } from './storage-adapter';

const exec = promisify(execFile);

/**
 * Best-effort probe of the encoded master so the Supervisor QA gate can grade
 * real facts (duration, audio-stream presence, pixel dimensions). There is no
 * ffprobe binary bundled, but `ffmpeg -i <file>` with no output target prints
 * the full stream header to stderr and exits non-zero — we parse that. Any
 * failure degrades gracefully to nulls (QA then grades on file size alone).
 */
async function probeMaster(
  bin: string,
  file: string,
): Promise<{ actualDurSec: number | null; audioPresent: boolean | null; width: number | null; height: number | null }> {
  let log = '';
  try {
    await exec(bin, ['-i', file], { maxBuffer: 1 << 24 });
  } catch (e: unknown) {
    log = String((e as { stderr?: string } | null)?.stderr ?? '');
  }
  if (!log) return { actualDurSec: null, audioPresent: null, width: null, height: null };

  let actualDurSec: number | null = null;
  const dm = log.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (dm) actualDurSec = Number(dm[1]) * 3600 + Number(dm[2]) * 60 + parseFloat(dm[3] ?? '0');

  const audioPresent = /Stream #\d+:\d+[^\n]*:\s*Audio:/.test(log);

  let width: number | null = null;
  let height: number | null = null;
  const vm = log.match(/Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
  if (vm) {
    width = Number(vm[1]);
    height = Number(vm[2]);
  }
  return { actualDurSec, audioPresent, width, height };
}
const RENDER_BUCKET = process.env.RENDER_BUCKET ?? 'renders';

export interface FfmpegManifest {
  /** Each clip's source URL and (optionally) its intended length in seconds. The
   *  assembler derives the master timeline from these durations so a 6-scene · 5s
   *  film and a 5-shot · 6s video both stitch to the correct length. */
  segments: { url: string; durationSec?: number }[];
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
export async function assembleWithFfmpeg(m: FfmpegManifest, signal?: AbortSignal): Promise<{ url: string; qa?: QaReport }> {
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
    // Derive the per-clip length from the segment durations so the master timeline
    // is correct for ANY cadence — a 6-scene · 5s film, a 5-shot · 6s video, etc.
    // (Average + round; all clips in a composition share one length.) Falls back to
    // the 6s default when no durations were supplied.
    const segDurs = segs.map((s) => Number(s.durationSec)).filter((d) => Number.isFinite(d) && d > 0);
    const clipSec = segDurs.length ? Math.max(1, Math.round(segDurs.reduce((a, b) => a + b, 0) / segDurs.length)) : 6;
    const transSec = transition === 'cut' ? 0 : 1;
    // 9:16 vertical (TikTok/Reels/Shorts) when the orientation / aspect says so.
    const orientation: 'landscape' | 'vertical' =
      String(g.orientation || g.aspect || '').replace(':', 'x') === '9x16' || String(g.orientation) === 'vertical'
        ? 'vertical'
        : 'landscape';

    const { filter, vmap, amap } = buildFilterComplex({
      orientation,
      nClips: inputs.length,
      hasVoice: Boolean(voice),
      hasMusic: Boolean(music),
      hasSfx: Boolean(sfx),
      fps,
      duckPct,
      transition,
      clipSec,
    });

    const out = join(dir, 'master.mp4');
    const args: string[] = ['-y'];
    for (const p of inputs) args.push('-i', p);
    for (const a of [voice, music, sfx]) if (a) args.push('-i', a);
    args.push('-filter_complex', filter, '-map', vmap);
    if (amap) args.push('-map', amap);
    args.push(
      // Professional-grade H.264 encode: 'fast' + CRF 18 is visually near-source
      // for 1080p film delivery while staying well inside the serverless CPU
      // budget (a 5-clip master encodes in seconds); High profile @ L4.2 is the
      // standard 1080p delivery target.
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
      // 256 kbps / 48 kHz AAC for clean, full-bandwidth film audio.
      '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
      // Hard-cap the container to the EXACT compiled target so the video and audio
      // streams are trimmed TOGETHER to the same length — a belt-and-suspenders
      // guarantee on top of the per-clip trim that the master is exactly this long
      // (30s for a full ≥4-clip film). `-t` truncates only if longer, so it can't
      // shorten a correctly-built timeline; it just enforces the contract.
      '-t', String(expectedMasterDuration(inputs.length, clipSec, transSec)),
      '-movflags', '+faststart', out,
    );

    await exec(bin, args, { maxBuffer: 1 << 28, timeout: 280_000, ...(signal ? { signal } : {}) });

    const data = await readFile(out);

    // ── Supervisor QA gate ───────────────────────────────────────────────────
    // Inspect the freshly-encoded master BEFORE it is hosted/handed to preview,
    // grading it against the defects this pipeline has historically shipped
    // (silent audio, truncated duration, empty stub, bitrate bloat, sub-1080p).
    // The verdict rides back on the response so the orchestrator/UI never
    // silently delivers a broken film.
    const probe = await probeMaster(bin, out);
    const qa = validateMaster({
      sizeBytes: data.byteLength,
      expectedDurSec: expectedMasterDuration(inputs.length, clipSec, transSec),
      actualDurSec: probe.actualDurSec,
      audioExpected: amap !== null,
      audioPresent: probe.audioPresent,
      width: probe.width,
      height: probe.height,
    });
    if (!qa.pass) {
      console.warn(`[masterQa] master FAILED quality gate (grade ${qa.grade}, score ${qa.score}):`, qa.issues.map((i) => i.code).join(', '));
    }

    const objectPath = `${m.pipelineId || 'render'}/${Date.now()}.mp4`;
    const url = await uploadAndSign(RENDER_BUCKET, objectPath, data.toString('base64'), 'video/mp4');
    if (!url) throw new Error('master upload failed (Supabase Storage not configured)');
    return { url, qa };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
