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
import { buildFilterComplex, sceneAwareTransitions } from './ffmpeg-filtergraph';
import { buildCubeFile, pickLutLook, LUT_FILENAME, type LutLook } from './cinematic-lut';
import { renderOverlayPng, renderMusicBugPng, type MarketingOverlay, type MusicBug } from '@/lib/pipeline/compositing/ffmpeg-overlay';
import { validateMaster, expectedMasterDuration, type QaReport } from './masterQa';
import { uploadBufferAndSign } from './storage-adapter';
import { burnCaptionSegments } from '@/lib/pipeline/compositing/caption-burn';
import { alignmentToCaptionSegments, type ElevenAlignment } from '@/lib/pipeline/compositing/word-synced-captions';

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
  /** STEP 2.3 — ElevenLabs with-timestamps alignment for word-synced burned captions.
   *  When present, timed FiraGO caption strips are burned into the master AFTER the
   *  stitch (fail-open: a miss ships the un-captioned master, byte-for-byte as before). */
  captionAlignment?: ElevenAlignment | null;
}

/** True when the CPU assembler can run (binary bundled). */
export function ffmpegAssemblyAvailable(): boolean {
  return Boolean(ffmpegStatic);
}

// Per-asset download cap. A clip is ~10MB and lands in a few seconds on the
// node's egress; 45s is generous headroom. Its REAL job is to stop ONE stalled
// fetch (a clip URL that connects but never streams from the serverless node)
// from pinning the whole function until the platform hard-kills it at
// maxDuration — the root cause of the 60s/12-clip assemble hang. On trip the
// asset fails fast with a named error so the saga compensate runs.
const DOWNLOAD_TIMEOUT_MS = 45_000;

const hostOf = (url: string): string => {
  try { return new URL(url).host; } catch { return 'asset'; }
};

async function download(url: string, dest: string, signal?: AbortSignal): Promise<string> {
  // Combine the caller's deadline signal with a per-request timeout: whichever
  // fires first aborts THIS fetch. Without the timeout, only the route's ~525s
  // dispatch deadline could free a stalled download — long enough to look like a
  // hang and (if it didn't propagate) let the platform kill the function first.
  const ac = new AbortController();
  let timedOut = false;
  const onAbort = () => ac.abort((signal as { reason?: unknown } | undefined)?.reason);
  if (signal) {
    if (signal.aborted) ac.abort((signal as { reason?: unknown }).reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => { timedOut = true; ac.abort(); }, DOWNLOAD_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await writeFile(dest, Buffer.from(await r.arrayBuffer()));
    return dest;
  } catch (err) {
    const reason = timedOut
      ? `timed out after ${DOWNLOAD_TIMEOUT_MS}ms`
      : signal?.aborted
        ? 'cancelled by assemble deadline'
        : err instanceof Error ? err.message : String(err);
    throw new Error(`asset download failed (${hostOf(url)}): ${reason}`);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/** Bounded-concurrency clip downloads that PRESERVE input order. Parallelism
 *  reclaims the largest fixed chunk of wall-clock for the 12-clip master (12
 *  sequential fetches → ~6 in flight); the per-download timeout above means one
 *  bad URL fails the batch fast instead of serializing into a hang. */
async function downloadAllOrdered(
  urls: string[], dir: string, signal?: AbortSignal, concurrency = 6,
): Promise<string[]> {
  const out: string[] = new Array(urls.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < urls.length; i = next++) {
      out[i] = await download(urls[i]!, join(dir, `seg${i}.mp4`), signal);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return out;
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
    // Download the clips in parallel (order-preserving) and the audio lanes
    // alongside them — all share the caller's deadline signal AND a per-asset
    // timeout, so the download phase can no longer silently pin the function.
    const tDl = Date.now();
    const [inputs, voice, music, sfx] = await Promise.all([
      downloadAllOrdered(segs.map(s => s!.url), dir, signal),
      m.voiceoverUrl ? download(m.voiceoverUrl, join(dir, 'voice.m4a'), signal) : Promise.resolve(null),
      m.musicUrl ? download(m.musicUrl, join(dir, 'music.m4a'), signal) : Promise.resolve(null),
      m.sfxUrl ? download(m.sfxUrl, join(dir, 'sfx.m4a'), signal) : Promise.resolve(null),
    ]);
    // eslint-disable-next-line no-console
    console.log(`[assemble] downloaded ${segs.length} clips + ${[voice, music, sfx].filter(Boolean).length} audio lanes in ${Date.now() - tDl}ms`);

    const g = m.globalRender ?? {};
    const fps = String(g.fps) === '60' ? 60 : 24;
    const duckPct = typeof g.vocal_ducking_pct === 'number' ? g.vocal_ducking_pct : 30;
    const transition = String(g.transition ?? 'crossfade');
    // PHASE 2 L2/L6 — opt-in 3-track audio master + smart-ducking knobs (all default
    // OFF/undefined → the existing 2-lane documentary mix is unchanged). The client
    // sets these via globalRender (three_track_mix / music_volume / sfx_volume /
    // smart_duck / duck_db) so the assembler can address dialogue/music/sfx separately.
    const threeTrackMix = g.three_track_mix === true || String(g.three_track_mix) === 'true';
    const musicVolume = typeof g.music_volume === 'number' ? g.music_volume : undefined;
    const sfxVolume = typeof g.sfx_volume === 'number' ? g.sfx_volume : undefined;
    const smartDuck = g.smart_duck === false || String(g.smart_duck) === 'false' ? false : undefined;
    const duckDb = typeof g.duck_db === 'number' ? g.duck_db : undefined;
    // Derive the per-clip length from the segment durations so the master timeline
    // is correct for ANY cadence — a 6-scene · 5s film, a 5-shot · 6s video, etc.
    // (Average + round; all clips in a composition share one length.) Falls back to
    // the 6s default when no durations were supplied.
    const segDurs = segs.map((s) => Number(s.durationSec)).filter((d) => Number.isFinite(d) && d > 0);
    const clipSec = segDurs.length ? Math.max(1, Math.round(segDurs.reduce((a, b) => a + b, 0) / segDurs.length)) : 6;
    const transSec = transition === 'cut' ? 0 : 1;
    // Output canvas: landscape 16:9 · vertical 9:16 · square 1:1 · portrait 4:5.
    // Resolved from globalRender.orientation (the panel's Format) or a raw aspect.
    const orientation: 'landscape' | 'vertical' | 'square' | 'portrait' = (() => {
      const o = String(g.orientation || '').toLowerCase();
      if (o === 'vertical' || o === 'square' || o === 'portrait' || o === 'landscape') return o;
      const a = String(g.orientation || g.aspect || '').replace(':', 'x');
      if (a === '9x16') return 'vertical';
      if (a === '1x1') return 'square';
      if (a === '4x5') return 'portrait';
      return 'landscape';
    })();
    // Canvas dimensions for overlay PNGs (brand lower-third, music bug) — must match
    // the filtergraph's master canvas so overlays composite at 1:1 pixels.
    const [ovW, ovH]: readonly [number, number] =
      orientation === 'vertical' ? [1080, 1920]
        : orientation === 'square' ? [1080, 1080]
          : orientation === 'portrait' ? [1080, 1350]
            : [1920, 1080];

    // Cinematic 3D LUT grade. The look is chosen by the orchestrator (globalRender.lut)
    // or auto-classified from the brief (night/neon → purple-gold, golden → warm).
    // We write the .cube to the temp dir and feed lut3d the path. Fail-open: any
    // write error simply skips the LUT (the base colorbalance grade still applies).
    let lut3dPath: string | undefined;
    let lutLook: LutLook | null = null;
    try {
      const requested = String(g.lut || '').trim() as LutLook;
      lutLook = (['cinematic', 'night_neon', 'warm_golden'] as const).includes(requested)
        ? requested
        : pickLutLook(typeof g.brief === 'string' ? g.brief : undefined);
      const cubePath = join(dir, LUT_FILENAME[lutLook]);
      await writeFile(cubePath, buildCubeFile(lutLook));
      lut3dPath = cubePath;
      // eslint-disable-next-line no-console
      console.log(`[assemble] applying lut3d grade: ${LUT_FILENAME[lutLook]} (${lutLook})`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[assemble] LUT write failed, using base grade only:', e instanceof Error ? e.message : e);
      lut3dPath = undefined;
    }

    // Brand lower-third (music videos) — burned IN THIS pass, not a fragile
    // post-stitch round-trip. Render the SVG→PNG at the exact canvas size and add
    // it as the LAST input so the filtergraph composites it over the graded video.
    let brandPngPath: string | undefined;
    try {
      const raw = typeof g.brandLowerThird === 'string' ? g.brandLowerThird : '';
      if (raw) {
        const spec = JSON.parse(raw) as MarketingOverlay;
        const W = ovW;
        const H = ovH;
        const png = await renderOverlayPng(spec, W, H);
        if (png) {
          const p = join(dir, 'brand-lowerthird.png');
          await writeFile(p, png);
          brandPngPath = p;
          // eslint-disable-next-line no-console
          console.log('[assemble] brand lower-third burned into the stitch:', spec.overlayText, '/', spec.website);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[assemble] brand overlay skipped:', e instanceof Error ? e.message : e);
      brandPngPath = undefined;
    }

    // MTV-style music info bug — a "now playing" card (artist / track / theme /
    // MyAvatar.ge Originals) faded in over the first ~4s. Rendered to a PNG and added
    // as the LAST -i input (after the brand PNG); the filtergraph fades + time-gates it.
    let musicBugPath: string | undefined;
    try {
      const raw = typeof g.musicBug === 'string' ? g.musicBug : '';
      if (raw) {
        const spec = JSON.parse(raw) as MusicBug;
        const W = ovW;
        const H = ovH;
        const png = await renderMusicBugPng(spec, W, H);
        if (png) {
          const p = join(dir, 'music-bug.png');
          await writeFile(p, png);
          musicBugPath = p;
          // eslint-disable-next-line no-console
          console.log('[assemble] music info bug burned into the opening:', spec.track, '/', spec.artist);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[assemble] music bug skipped:', e instanceof Error ? e.message : e);
      musicBugPath = undefined;
    }

    // MUSIC-VIDEO / SONG-MASTER audio mode — the song rules, the standalone narrator
    // is omitted, and any SFX is sidechain-ducked under the song. Driven by the
    // explicit Music Video Mode flag threaded through globalRender (the voice-overlap fix).
    const musicVideo = g.musicVideo === true || String(g.musicVideo) === 'true';

    const { filter, vmap, amap } = buildFilterComplex({
      orientation,
      nClips: inputs.length,
      hasVoice: Boolean(voice),
      hasMusic: Boolean(music),
      hasSfx: Boolean(sfx),
      fps,
      duckPct,
      transition,
      // PHASE 5A — beat-aware per-join transitions for the xfade master (soften the
      // arc-reveal + closing joins to a dissolve). Skipped for the hard-cut music-video
      // master and single-clip films, where it's a no-op.
      ...(transition !== 'cut' && inputs.length >= 2 ? { transitions: sceneAwareTransitions(inputs.length) } : {}),
      clipSec,
      lut3dPath,
      hasBrandOverlay: Boolean(brandPngPath),
      musicVideo,
      hasMusicBug: Boolean(musicBugPath),
      // PHASE 2 L2/L6 — opt-in 3-track master (gated; only fires with voice+music+sfx).
      ...(threeTrackMix ? { threeTrackMix } : {}),
      ...(musicVolume !== undefined ? { musicVolume } : {}),
      ...(sfxVolume !== undefined ? { sfxVolume } : {}),
      ...(smartDuck === false ? { smartDuck } : {}),
      ...(duckDb !== undefined ? { duckDb } : {}),
    });

    const out = join(dir, 'master.mp4');
    const args: string[] = ['-y'];
    for (const p of inputs) args.push('-i', p);
    for (const a of [voice, music, sfx]) if (a) args.push('-i', a);
    // Brand lower-third PNG is the LAST input → its index matches `ai` in the
    // filtergraph (after every video + audio input).
    if (brandPngPath) args.push('-i', brandPngPath);
    // Music info-bug PNG is the LAST input (after the brand PNG) — matches the
    // filtergraph's overlay-index order (brand, then bug). It MUST be looped into a
    // short stream (`-loop 1 -t`): a plain single-frame image sits at t=0, so the
    // filtergraph's alpha fade (st=0.3s …) would never resolve and the bug would
    // render fully transparent. A 5s looped clip gives the fade in/out a timeline.
    if (musicBugPath) args.push('-loop', '1', '-t', '5', '-i', musicBugPath);
    args.push('-filter_complex', filter, '-map', vmap);
    if (amap) args.push('-map', amap);
    // Target byte budget for the master so it fits under the storage upload limit
    // (~50MB project cap). Derived per-runtime: a 30s master (~40MB) is barely
    // touched; a 49s/60s master is capped from ~70MB down to ~MASTER_TARGET_MB.
    const masterDurSec = expectedMasterDuration(inputs.length, clipSec, transSec);
    const MASTER_TARGET_MB = 42;
    const AUDIO_KBPS = 256;
    const masterMaxrateKbps = Math.max(2_000, Math.round((MASTER_TARGET_MB * 8192) / masterDurSec) - AUDIO_KBPS);
    args.push(
      // v331 (FIX 5) — CPU-FALLBACK FRUGAL ENCODE. The previous 'fast' + CRF 18 +
      // High@L4.2 encode of a 1080×1920 30s master OOM-killed the serverless
      // function (raw 500 at ~230s, before the 280s exec timeout). x264's
      // rc-lookahead + motion-estimation buffers are the dominant memory consumer
      // and scale with the preset; 'ultrafast' removes the lookahead entirely and
      // a 2-thread cap bounds the per-thread buffers, so the stitch fits inside the
      // 3008 MB function. Resolution is UNCHANGED (still 1080p — no test/QA
      // regression); only the encoder effort drops. The GPU RunPod worker, once
      // provisioned, renders the full-quality 1080p/60fps master and bypasses this
      // path. ultrafast forbids the High-profile tools (CABAC/8x8dct), so the
      // explicit -profile/-level are dropped to avoid a conflict; yuv420p keeps it
      // universally playable.
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
      '-threads', '2', '-pix_fmt', 'yuv420p',
      // SIZE BOUND (the 60s-master delivery fix). 'ultrafast' is bitrate-INEFFICIENT:
      // an uncapped 49s/1080×1920 CRF20 master balloons to ~70MB, which Supabase
      // Storage rejects with "exceeded the maximum allowed size" (the project upload
      // limit is ~50MB) — the exact break that let 30s masters (~40MB) deliver while
      // 60s masters never could. A VBV cap keeps CRF quality where it fits and only
      // trims bitrate spikes, targeting ~MASTER_TARGET_MB regardless of runtime so the
      // master always lands under the limit. maxrate adds no memory → OOM tuning above
      // is unaffected. (Raise the Supabase project upload limit to restore full bitrate.)
      '-maxrate', `${masterMaxrateKbps}k`, '-bufsize', `${masterMaxrateKbps * 2}k`,
      // 256 kbps / 48 kHz AAC for clean, full-bandwidth film audio.
      '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
      // Hard-cap the container to the EXACT compiled target so the video and audio
      // streams are trimmed TOGETHER to the same length — a belt-and-suspenders
      // guarantee on top of the per-clip trim that the master is exactly this long
      // (30s for a full ≥4-clip film). `-t` truncates only if longer, so it can't
      // shorten a correctly-built timeline; it just enforces the contract.
      '-t', String(masterDurSec),
      '-movflags', '+faststart', out,
    );

    const tEnc = Date.now();
    await exec(bin, args, { maxBuffer: 1 << 28, timeout: 280_000, ...(signal ? { signal } : {}) });
    // eslint-disable-next-line no-console
    console.log(`[assemble] ffmpeg encode (${inputs.length} clips → master) in ${Date.now() - tEnc}ms`);

    // STEP 2.3 — word-synced caption burn (FAIL-OPEN). Only runs when the caller supplied
    // a with-timestamps alignment; otherwise `out` is untouched → zero blast radius on all
    // existing (music-video / film / product-ad) traffic. Rewrites `out` in place so the QA
    // probe + upload below see the captioned master. A burn miss keeps the original.
    if (m.captionAlignment) {
      const segs = alignmentToCaptionSegments(m.captionAlignment);
      const pre = segs.length ? await probeMaster(bin, out) : null;
      if (pre?.width && pre?.height) {
        const captioned = await burnCaptionSegments(out, segs, { width: pre.width, height: pre.height });
        if (captioned) {
          await writeFile(out, captioned);
          // eslint-disable-next-line no-console
          console.log(`[assemble] burned ${segs.length} word-synced caption segments`);
        }
      }
    }

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
    // v330 — host the user-facing master with a 7-day signed URL (matching the audio-bed
    // + overlay convention). The default 15-min TTL expired while the film sat in chat
    // history, producing a blank player (MEDIA_ERR 4) on revisit. The status route also
    // re-signs on read-back as a second layer of defence.
    // Upload the master Buffer DIRECTLY (no base64 round-trip) — a 30–60s 1080p master
    // held twice in memory (string + buffer) was failing the upload on larger films,
    // surfacing as the misleading "Storage not configured" error. uploadBufferAndSign
    // streams the Buffer and retries once on a transient failure.
    const url = await uploadBufferAndSign(RENDER_BUCKET, objectPath, data, 'video/mp4', 604_800);
    if (!url) throw new Error('master upload failed (storage rejected the file or is unavailable — check service-role key + project upload size limit)');
    return { url, qa };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
