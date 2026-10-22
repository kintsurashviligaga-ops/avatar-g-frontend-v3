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
import { mkdtemp, writeFile, readFile, rm, stat, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { buildFilterComplex, joinOverlaps, resolveJoins } from './ffmpeg-filtergraph';
import { buildCubeFile, LUT_FILENAME, type LutLook } from './cinematic-lut';
import { keepsOnlySong } from './songMix';
import { matchClipLooks, parseSignalStats, type ClipStats } from '@/lib/video/clipLook';
import { renderOverlayPng, renderMusicBugPng, type MarketingOverlay, type MusicBug } from '@/lib/pipeline/compositing/ffmpeg-overlay';
import { validateMaster, expectedMasterDuration, MasterQaRejected, type QaReport } from './masterQa';
import { SoundtrackUnreadable } from './soundtrackUnreadable';
import { VIDEO_FPS, finalCutForAssemble } from '@/lib/video/durationContract';
import { contractedSegmentsError } from '@/lib/video/assemblyInput';
import { countDecodedFrames } from '@/lib/video/frameCount';
import { uploadBufferAndSign, removeStorageObjects } from './storage-adapter';
import { readBodyWithCap } from '@/lib/security/allowlistedAudioFetch';
import { fetchPublic } from '@/lib/web/publicFetch';
import { burnCaptionSegments } from '@/lib/pipeline/compositing/caption-burn';
import { alignmentToCaptionSegments, type ElevenAlignment } from '@/lib/pipeline/compositing/word-synced-captions';
import { muteAf, clampWindows, DEFAULT_DUCK_DB, type MixWindow } from '@/lib/pipeline/audio/audioMix';
import { resolveDialogueCastPlan, buildDialoguePremixFilter, DIALOGUE_DUCK_DB } from './dialogueCastPlan';
import { parseScript, scriptMixWindows } from '@/lib/pipeline/script/scriptSchema';
import { getFeatureFlag } from '@/lib/server/feature-flags';
import { isMediaGoogleOnly } from '@/lib/providers/mediaPolicy';
import { lipsyncNode, passthroughLipsyncProvider, replicateLipsyncProvider, heygenLipsyncProvider, cascadeLipsyncProvider, type LipsyncProvider } from '@/lib/pipeline/lipsync/lipsyncNode';

const exec = promisify(execFile);

/**
 * Best-effort probe of the encoded master so the Supervisor QA gate can grade
 * real facts (duration, audio-stream presence, pixel dimensions). There is no
 * ffprobe binary bundled, but `ffmpeg -i <file>` with no output target prints
 * the full stream header to stderr and exits non-zero — we parse that. Any
 * failure degrades gracefully to nulls (QA then grades on file size alone).
 */
/**
 * Does this clip carry an AUDIO stream? Same `ffmpeg -i` stderr-header trick as probeMaster. Veo bakes a real
 * diegetic soundtrack into every scene, so the stitch preserves it — but the filtergraph may only reference
 * `[i:a]` for inputs that ACTUALLY have audio (referencing a missing stream aborts the whole encode), and a
 * silent fallback clip (Runway/Kling/LTX) must contribute silence instead. Any failure → false (safe: silent).
 */
async function probeHasAudio(bin: string, file: string): Promise<boolean> {
  try {
    await exec(bin, ['-i', file], { maxBuffer: 1 << 22 });
    return false;
  } catch (e: unknown) {
    const log = String((e as { stderr?: string } | null)?.stderr ?? '');
    return /Stream #\d+:\d+[^\n]*:\s*Audio:/.test(log);
  }
}

/** Average exposure + colour intensity of one clip (2 sampled frames per second, small scale: fast). Null on failure. */
async function probeClipLook(bin: string, file: string, seconds: number): Promise<ClipStats | null> {
  try {
    const { stdout } = await exec(
      bin,
      ['-hide_banner', '-t', String(seconds), '-i', file, '-vf', 'fps=2,scale=320:-2,signalstats,metadata=print:file=-', '-an', '-f', 'null', '-'],
      { maxBuffer: 1 << 22 },
    );
    return parseSignalStats(String(stdout));
  } catch {
    return null;
  }
}

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
  /** v357 — the parsed film script (scriptSchema shape). When present AND FILM_AUDIO_MIX_ENABLED
   *  is on, its explicit muteWindows drive the hard-mute post-pass (silence beats) instead of any
   *  hardcoded window. Validated fail-open via parseScript: a malformed payload is ignored, so the
   *  master is byte-identical to the no-script path. */
  script?: unknown;
  /** DAY-4 multi-voice casting — per-SPEAKER, TIMECODED dialogue stems (each a rendered line in its cast
   *  ElevenLabs voice, from generateDialogueVoiceover's casting path). When ≥2 DISTINCT speakers are all
   *  timecoded, the assembler premixes them into ONE spatialized dialogue lane (each speaker panned to a
   *  stereo position) that replaces the single voice lane; music/sfx then duck −12 dB under it via the
   *  existing voice-keyed sidechain. Anything else (absent, one speaker, an untimed/dropped turn) → the
   *  single-voice `voiceoverUrl` path runs UNCHANGED (fail-open fallback). */
  dialogueStems?: { url: string; speaker: string; startSec?: number | null }[];
  /** Video Core v1.0 §4 — the contracted FINAL length (lib/video/durationContract). The clips are the native master; the
   *  delivered film is this long, by a frame-exact `-t` on the 30 fps timeline (29.7 s = 891 frames). Checked against the
   *  master it is cut from: a length that cannot be cut from it is a thrown refusal (the saga refunds), never another
   *  length delivered. Absent → the master is N × clipSec at 24 fps, as before. */
  finalDurationSec?: number | null;
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
    // A clip URL can come from the caller: public hosts only, every redirect re-checked, the connection DNS-pinned
    // (lib/web/publicFetch). It used to be a string check of the first address and a fetch that followed redirects.
    const got = await fetchPublic(url, { signal: ac.signal, timeoutMs: DOWNLOAD_TIMEOUT_MS + 1_000 });
    if (!got.ok) throw new Error(got.error === 'http_error' ? `HTTP ${got.status ?? 'error'}` : got.error === 'invalid_url' || got.error === 'blocked_host' ? 'blocked host' : got.error);
    // Cap the body DURING download so one asset can't OOM the function (clips ~10MB, a 60s master is
    // well under 200MB); over-cap / unreadable → named error → the saga compensate runs.
    const buf = await readBodyWithCap(got.res, 200_000_000);
    if (!buf) throw new Error('exceeded 200MB cap or unreadable body');
    await writeFile(dest, buf);
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

  // Enforce this at the renderer boundary too: internal callers need the same no-partial rule as the HTTP route.
  // Reject before downloading clips/audio or invoking optional providers; a missing scene is never filtered away.
  if (m.finalDurationSec !== undefined && m.finalDurationSec !== null) {
    if (typeof m.finalDurationSec !== 'number' || !Number.isFinite(m.finalDurationSec) || m.finalDurationSec <= 0) {
      throw new Error('contracted final duration invalid');
    }
    const reason = contractedSegmentsError(m.segments);
    if (reason) throw new Error(`contracted segments invalid: ${reason}`);
  }
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
    // Round 3 (P1) — every audio lane is checked for an audio stream BEFORE the one encode command is built. A file ffmpeg
    // cannot read as audio used to die inside the encode as execFile's raw "Command failed" (unnamed: the route said
    // assembly_failed); it is a named refusal now, SoundtrackUnreadable (music_unreadable), with nothing encoded or hosted.
    for (const [lane, file] of [['music', music], ['voice', voice], ['sfx', sfx]] as const) {
      if (file && !(await probeHasAudio(bin, file))) throw new SoundtrackUnreadable(lane);
    }

    const g = m.globalRender ?? {};
    // Video Core v1.0 §4 — a film with a contracted final length renders on the 30 fps timeline, so the delivered length is a
    // whole number of frames (24 s = 720, 29.7 s = 891). Without one: 24 fps, as before.
    const finalRequested = typeof m.finalDurationSec === 'number' && Number.isFinite(m.finalDurationSec) ? m.finalDurationSec : null;
    const fps = String(g.fps) === '60' ? 60 : finalRequested !== null ? VIDEO_FPS : 24;
    const duckPct = typeof g.vocal_ducking_pct === 'number' ? g.vocal_ducking_pct : 30;
    // The whole-film transition and the per-join list from the studio's scene timeline ("cut,dissolve,cut" — globalRender
    // carries scalars only, so the list travels comma-separated; unknown names are dropped). Resolved by the ONE reading the
    // assemble route's pre-check and the studio's render-time check also use (ffmpeg-filtergraph resolveJoins), so the
    // stitched length they predict is the one encoded here.
    const { transition, transitions: joinTransitions } = resolveJoins(segs.length, g);
    // PHASE 2 L2/L6 — opt-in 3-track audio master + smart-ducking knobs (all default
    // OFF/undefined → the existing 2-lane documentary mix is unchanged). The client
    // sets these via globalRender (three_track_mix / music_volume / sfx_volume /
    // smart_duck / duck_db) so the assembler can address dialogue/music/sfx separately.
    const threeTrackMix = g.three_track_mix === true || String(g.three_track_mix) === 'true';
    const musicVolume = typeof g.music_volume === 'number' ? g.music_volume : undefined;
    const sfxVolume = typeof g.sfx_volume === 'number' ? g.sfx_volume : undefined;
    const smartDuck = g.smart_duck === false || String(g.smart_duck) === 'false' ? false : undefined;
    const duckDb = typeof g.duck_db === 'number' ? g.duck_db : undefined;

    // ── FEATURE GATES (additive; default OFF → this assembler is byte-identical when unset) ──────────
    // v358 #3 — resolved via the runtime flag store: ENV wins when set, else the feature_flags DB override,
    // else the default (false). Timeout-bounded + fail-open to the env/default on any DB issue, so this
    // matches the prior process.env reads for the canonical '1'/unset values and never hangs the render.
    const AUDIO_MIX_ON = await getFeatureFlag('FILM_AUDIO_MIX_ENABLED', false);
    // Phase 18: cascade WIRED, but OPT-IN (see the flag note). Its legs are HeyGen and Replicate, so MEDIA_GOOGLE_ONLY
    // (lib/providers/mediaPolicy) holds it off whatever the flag says: the master is kept as rendered.
    const LIPSYNC_ON = (await getFeatureFlag('FILM_LIPSYNC_ENABLED', false)) && !isMediaGoogleOnly();
    // FILM_AUDIO_MIX_ENABLED — the 4-field mixer compiler resolves the ducking depth (−12 dB by default)
    // and the hard-mute window: the depth is threaded through the PROVEN filtergraph below, and the
    // hard-mute is applied as a small fail-open post-pass (never a rewrite of the master graph).
    let effectiveDuckDb = duckDb;
    let scriptMuteWindows: MixWindow[] = [];
    if (AUDIO_MIX_ON) {
      // v357 — parse the script (fail-open) and DRIVE the silence-beat mute windows from it, never a
      // hardcoded 6–8s guess. The score already ducks under dialogue via buildFilterComplex's voice-keyed
      // sidechain, so the compiler's time-driven ducking (from dialogueSpans) is intentionally NOT layered
      // on here — it would double-duck; dialogueSpans stays a standalone-compiler capability. The mute
      // windows are clamped to the DERIVED master length + turned into hardMuteAf at the post-pass below
      // (where masterDurSec is known). No script → no windows → post-pass skipped → master unchanged.
      const parsed = m.script != null ? parseScript(m.script) : null;
      scriptMuteWindows = parsed?.ok ? scriptMixWindows(parsed.script).muteWindows : [];
      effectiveDuckDb = typeof duckDb === 'number' ? duckDb : DEFAULT_DUCK_DB;
      // eslint-disable-next-line no-console
      console.log(`[assemble] FILM_AUDIO_MIX_ENABLED duck=${effectiveDuckDb}dB script=${parsed?.ok ? 'ok' : m.script != null ? 'invalid' : 'none'} muteWindows=${scriptMuteWindows.length}`);
    }

    // ── DAY-4 MULTI-VOICE CHARACTER CASTING ──────────────────────────────────────────────────────────
    // When the manifest carries per-SPEAKER, TIMECODED dialogue stems for ≥2 DISTINCT speakers, premix them
    // into ONE spatialized stereo dialogue lane — each character cast (castRoster) to its own voice seed AND
    // panned to its own stereo position — and use THAT as the voice lane. The existing voice-keyed sidechain
    // then ducks music/sfx by exactly −12 dB under active dialogue. Casting only chooses voice IDs + stereo
    // pans; it NEVER touches TTS settings, so the narrator stability stays locked at 0.48 (lib/audio/tts-model).
    // ADDITIVE + FAIL-OPEN: no stems / one speaker / any untimed-or-dropped turn / a premix error → voicePath
    // stays the single downloaded `voice` (the proven single-voice assembly), byte-identical to before.
    let voicePath = voice;
    if (Array.isArray(m.dialogueStems) && m.dialogueStems.length >= 2) {
      try {
        const stems = m.dialogueStems.filter((s) => s && typeof s.url === 'string' && s.url.trim());
        const plan = resolveDialogueCastPlan(stems.map((s) => ({ speaker: s.speaker, startSec: s.startSec ?? null })));
        // 1:1 stem↔entry guard: every stem must be a valid, timecoded turn (no drops) so filter input [i:a]
        // lines up with plan.entries[i]. Any mismatch falls back to the single-voice path.
        if (plan.multiSpeaker && plan.entries.length === stems.length) {
          const stemPaths = await Promise.all(stems.map((s, i) => download(s.url, join(dir, `dstem${i}.m4a`), signal)));
          const premixOut = join(dir, 'dialogue_cast.m4a');
          await exec(
            bin,
            ['-y', ...stemPaths.flatMap((p) => ['-i', p]), '-filter_complex', buildDialoguePremixFilter(plan), '-map', '[dialogue]', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', premixOut],
            { maxBuffer: 1 << 26, timeout: 120_000, ...(signal ? { signal } : {}) },
          );
          voicePath = premixOut;
          effectiveDuckDb = typeof effectiveDuckDb === 'number' ? effectiveDuckDb : DIALOGUE_DUCK_DB;
          // eslint-disable-next-line no-console
          console.log(`[assemble] multi-voice cast lane: ${plan.distinctSpeakers} speakers → spatial premix, music ducks ${effectiveDuckDb}dB under dialogue`);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[assemble] multi-voice premix failed → single-voice fallback:', e instanceof Error ? e.message : e);
        voicePath = voice;
      }
    }

    // Derive the per-clip length from the segment durations so the master timeline
    // is correct for ANY cadence — a 6-scene · 5s film, a 5-shot · 6s video, etc.
    // (Average + round; all clips in a composition share one length.) Falls back to
    // the 6s default when no durations were supplied.
    const segDurs = segs.map((s) => Number(s.durationSec)).filter((d) => Number.isFinite(d) && d > 0);
    const clipSec = segDurs.length ? Math.max(1, Math.round(segDurs.reduce((a, b) => a + b, 0) / segDurs.length)) : 6;
    // ⚠️ THE USER'S TRANSITION USED TO BE OVERRIDDEN. For every non-cut film the beat-aware crossfade/dissolve
    // pattern replaced the chosen join, so Zoom and Slide never rendered on a multi-clip film. Now: the caller's
    // per-join list wins; else an explicit choice applies to every join; only the default crossfade gets the
    // beat-aware softening.
    const overlapSec = joinOverlaps(segs.length, transition, joinTransitions, fps);
    // Mean overlap per join — expectedMasterDuration's model (n·clip − (n−1)·trans) then matches the graph exactly.
    const transSec = overlapSec.length ? overlapSec.reduce((a, b) => a + b, 0) / overlapSec.length : 0;
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
        : null; // null by default: preserve natural Veo colors and avoid harsh/burnt contrast
      if (lutLook) {
        const cubePath = join(dir, LUT_FILENAME[lutLook]);
        await writeFile(cubePath, buildCubeFile(lutLook));
        lut3dPath = cubePath;
        // eslint-disable-next-line no-console
        console.log(`[assemble] applying lut3d grade: ${LUT_FILENAME[lutLook]} (${lutLook})`);
      }
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

    // V8-F4 — UNCONDITIONAL −12 dB ducking: whenever a voice/dialogue lane exists, pin the
    // music/SFX duck DEPTH to DEFAULT_DUCK_DB, independent of FILM_AUDIO_MIX_ENABLED and of the
    // client's duckPct. The voice-keyed sidechain already fires; this guarantees the −12 dB
    // contract deterministically. Respects an explicit client duck_db and the multi-voice path
    // (both set effectiveDuckDb first). No voice lane → left undefined (nothing to duck under).
    if (voicePath && typeof effectiveDuckDb !== 'number') {
      effectiveDuckDb = DEFAULT_DUCK_DB;
    }

    // NATIVE DIEGETIC AUDIO — Veo renders every scene WITH its soundtrack baked in (waves, footsteps, room
    // tone, dialogue). Probe which clips actually carry an audio stream so the filtergraph can preserve that
    // sound (and so a silent fallback clip contributes silence instead of aborting the encode). Header-only
    // reads, run in parallel; a probe failure degrades to "silent" for that clip.
    const nativeAudio = await Promise.all(inputs.map((p) => probeHasAudio(bin, p)));
    // eslint-disable-next-line no-console
    console.log(`[assemble] native clip audio: ${nativeAudio.filter(Boolean).length}/${nativeAudio.length} clips carry sound`);

    // SHOT MATCHING — measure each clip's exposure and colour intensity and correct it toward the film's median, so
    // a vivid clip next to a dull one stops jumping at the cut. FILM_SHOT_MATCH=0 turns it off; a probe miss leaves
    // that clip uncorrected.
    const shotMatchOn = inputs.length >= 2 && !/^(0|false|off)$/i.test((process.env.FILM_SHOT_MATCH || '').trim());
    const clipLook = shotMatchOn
      ? matchClipLooks(await Promise.all(inputs.map((p) => probeClipLook(bin, p, clipSec))))
      : [];
    if (clipLook.some(Boolean)) {
      // eslint-disable-next-line no-console
      console.log(`[assemble] shot matching: ${clipLook.map((l) => (l ? `b${l.brightness}/s${l.saturation}` : '=')).join(' ')}`);
    }

    const { filter, vmap, amap } = buildFilterComplex({
      orientation,
      nClips: inputs.length,
      ...(clipLook.some(Boolean) ? { clipLook } : {}),
      // Preserve the clips' own sound whenever ANY clip has it (opt-in: omitted → previous graph unchanged) — except
      // under a music video's song: each Veo clip invents its own music and singing, so keeping them made the song
      // jump at every cut (Production 2026-10-16). The one continuous song is the only soundtrack there.
      ...(nativeAudio.some(Boolean) && !keepsOnlySong({ musicVideo, hasMusic: Boolean(music) }) ? { nativeAudio } : {}),
      hasVoice: Boolean(voicePath),
      hasMusic: Boolean(music),
      hasSfx: Boolean(sfx),
      fps,
      duckPct,
      transition,
      // Video Core v1.0 §4 — under a contracted final length the master is the stitched footage, never padded to 30 s with a
      // cloned (frozen) last frame: the final is cut from real frames or refused.
      ...(finalRequested !== null ? { padToTarget: false } : {}),
      // PHASE 5A — beat-aware per-join transitions for the xfade master (soften the
      // arc-reveal + closing joins to a dissolve). Skipped for the hard-cut music-video
      // master and single-clip films, where it's a no-op.
      ...(joinTransitions && inputs.length >= 2 ? { transitions: joinTransitions.slice(0, inputs.length - 1) } : {}),
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
      ...(effectiveDuckDb !== undefined ? { duckDb: effectiveDuckDb } : {}),
    });

    const out = join(dir, 'master.mp4');
    const args: string[] = ['-y'];
    for (const p of inputs) args.push('-i', p);
    for (const a of [voicePath, music, sfx]) if (a) args.push('-i', a);
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
    // The stitched length: N clips less every join's overlap. Under the contract that IS the master (padToTarget false above);
    // without one, the legacy model — the ≥4-clip pad to the 30 s brand target included.
    const stitchSec = inputs.length * clipSec - overlapSec.reduce((a, b) => a + b, 0);
    const masterDurSec = finalRequested !== null ? stitchSec : expectedMasterDuration(inputs.length, clipSec, transSec);
    // The contracted final length, checked against the master it is cut from: refused (the saga refunds) rather than
    // delivered at another length. `-t` below then stops the master at the final length — frame-exact at this rate.
    const finalCut = finalRequested !== null ? finalCutForAssemble(masterDurSec, finalRequested) : null;
    if (finalCut && !finalCut.ok) throw new Error(`final duration refused: ${finalCut.reason} (master ${masterDurSec}s, requested ${finalRequested}s)`);
    const deliverSec = finalCut?.ok ? finalCut.finalSec : masterDurSec;
    if (finalCut?.ok) {
      // eslint-disable-next-line no-console
      console.log(`[assemble] final cut: master ${masterDurSec}s → final ${deliverSec}s (${finalCut.finalFrames} frames at ${fps} fps, ${finalCut.trimSec}s trimmed)`);
    }
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
      '-t', String(deliverSec),
      '-movflags', '+faststart', out,
    );

    const tEnc = Date.now();
    await exec(bin, args, { maxBuffer: 1 << 28, timeout: 280_000, ...(signal ? { signal } : {}) });
    // eslint-disable-next-line no-console
    console.log(`[assemble] ffmpeg encode (${inputs.length} clips → master) in ${Date.now() - tEnc}ms`);

    // FILM_AUDIO_MIX_ENABLED — enforce the SCRIPT's mute windows (silence beats) as a fail-open audio-only
    // post-pass; there is no hardcoded window, so no script/windows → hardMuteAf null → this block is skipped.
    // The windows are first CLAMPED to the derived master length (masterDurSec) because script.totalDurationSec
    // is caller-declared and can diverge from the assembled length — an out-of-range window would otherwise
    // silently no-op. NB: on the already-mixed master this silences the FULL mix in each window (a deliberate
    // silence beat — NOT a per-lane score-only mute; per-lane muting would require threading into
    // buildFilterComplex). Guarded on `amap` so it fires for ANY audible master (incl. sfx-only). Rewrites
    // `out` in place; any failure keeps the original master.
    const clampedMute = clampWindows(scriptMuteWindows, masterDurSec);
    if (AUDIO_MIX_ON && clampedMute.dropped > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[assemble] hard-mute: dropped ${clampedMute.dropped} window(s) outside the ${masterDurSec}s master`);
    }
    const hardMuteAf = AUDIO_MIX_ON ? muteAf(clampedMute.windows) : null;
    if (AUDIO_MIX_ON && hardMuteAf && amap) {
      try {
        const muted = join(dir, 'master_mixed.mp4');
        await exec(bin, ['-y', '-i', out, '-af', hardMuteAf, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', muted], { maxBuffer: 1 << 28, timeout: 120_000, ...(signal ? { signal } : {}) });
        await rename(muted, out); // same fs → atomic, and no 42MB read-into-memory-and-write-back
        // eslint-disable-next-line no-console
        console.log(`[assemble] applied audio-mix hard-mute (${clampedMute.windows.length} window(s))`);
      } catch (e) { console.warn('[assemble] hard-mute post-pass skipped:', e instanceof Error ? e.message : e); }
    }

    // FILM_LIPSYNC_ENABLED — post-render lip-sync over the master. PRIORITY CASCADE: HeyGen PRIMARY →
    // Replicate FALLBACK (per Phase 18). Every leg is fail-open: HeyGen declines a VIDEO master (its
    // talking_photo engine is image-only) and falls through to the video-native Replicate sync/lipsync-2;
    // any error / sub-floor confidence keeps the raw master. Providers FETCH the media remotely, so the
    // local master + voice are HOSTED first (a /tmp path is invisible to them). With no keys the cascade
    // is empty → passthrough → byte-identical to lip-sync off.
    if (LIPSYNC_ON && voicePath) {
      try {
        const heygenKey = process.env.HEYGEN_API_KEY?.trim();
        const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();
        const provider: LipsyncProvider = (heygenKey || replicateToken)
          ? cascadeLipsyncProvider([
              heygenKey ? heygenLipsyncProvider({ apiKey: heygenKey }) : null,
              replicateToken ? replicateLipsyncProvider({ token: replicateToken, model: process.env.FILM_LIPSYNC_REPLICATE_MODEL }) : null,
            ])
          : passthroughLipsyncProvider;
        if (provider !== passthroughLipsyncProvider) {
          const ts = Date.now();
          const srcObj = `lipsync/${ts}-src.mp4`;
          const voiceObj = `lipsync/${ts}-voice.m4a`;
          const hostedClip = await uploadBufferAndSign(RENDER_BUCKET, srcObj, await readFile(out), 'video/mp4', 3600).catch(() => null);
          const hostedAudio = await uploadBufferAndSign(RENDER_BUCKET, voiceObj, await readFile(voicePath), 'audio/mp4', 3600).catch(() => null);
          if (hostedClip && hostedAudio) {
            const ls = await lipsyncNode({ clipUrl: hostedClip, audioUrl: hostedAudio }, { provider });
            // eslint-disable-next-line no-console
            console.log(`[assemble] lipsync provider=${ls.provider} fallback=${ls.usedFallback} conf=${ls.confidence}${ls.reason ? ` reason=${ls.reason}` : ''}`);
            // Confident sync → DOWNLOAD the remote result (readFile can't read an https URL). SAFETY: never
            // replace a good master with a corrupt/truncated output — a real sync preserves the frame set, so
            // reject anything empty (<50KB) or suspiciously small (<50% of the raw master). Write ATOMICALLY
            // (temp + rename) so `out` is never left half-written on a mid-write failure.
            if (!ls.usedFallback && ls.url) {
              const synced = await download(ls.url, join(dir, 'lipsynced.mp4'), signal).catch(() => null);
              if (synced) {
                try {
                  const [rawStat, syncStat] = await Promise.all([stat(out), stat(synced)]);
                  if (syncStat.size >= 50_000 && syncStat.size >= rawStat.size * 0.5) {
                    const tmp = join(dir, 'master.lipsynced.tmp.mp4');
                    await writeFile(tmp, await readFile(synced));
                    await rename(tmp, out); // atomic on the same fs
                  } else {
                    console.warn(`[assemble] lipsync result rejected (size ${syncStat.size} vs raw ${rawStat.size}) — keeping raw master`);
                  }
                } catch { /* keep raw master */ }
              }
            }
          }
          // Scratch inputs are single-use → best-effort delete so lip-sync never bloats storage.
          void removeStorageObjects(RENDER_BUCKET, [srcObj, voiceObj]).catch(() => {});
        }
      } catch (e) { console.warn('[assemble] lipsync stage skipped:', e instanceof Error ? e.message : e); }
    }

    // STEP 2.3 — word-synced caption burn (FAIL-OPEN). Only runs when the caller supplied
    // a with-timestamps alignment; otherwise `out` is untouched → zero blast radius on all
    // existing (music-video / film / product-ad) traffic. Rewrites `out` in place so the QA
    // probe + upload below see the captioned master. A burn miss keeps the original.
    if (m.captionAlignment) {
      const segs = alignmentToCaptionSegments(m.captionAlignment);
      const pre = segs.length ? await probeMaster(bin, out) : null;
      if (pre?.width && pre?.height) {
        // The cap is spread over the master's real length: the narration (and so the last caption) often ends first.
        const captioned = await burnCaptionSegments(out, segs, { width: pre.width, height: pre.height, durationSec: pre.actualDurSec ?? deliverSec });
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
    // Video Core v1.0 §4 — a contracted final is checked on its DECODED frames (lib/video/frameCount), not on the
    // container's duration: 29.7 s at 30 fps is 891 frames. The count rides on the QA report (frame_count_mismatch when
    // it is off or unreadable); a legacy master (no contract) is not counted.
    const actualFrames = finalCut?.ok ? await countDecodedFrames(bin, out, { ...(signal ? { signal } : {}) }).catch(() => null) : null;
    if (finalCut?.ok) {
      // eslint-disable-next-line no-console
      console.log(`[assemble] frame-exact QC: ${actualFrames ?? 'unreadable'} / ${finalCut.finalFrames} frames at ${fps} fps`);
    }
    const qa = validateMaster({
      sizeBytes: data.byteLength,
      expectedDurSec: deliverSec,
      actualDurSec: probe.actualDurSec,
      audioExpected: amap !== null,
      audioPresent: probe.audioPresent,
      width: probe.width,
      height: probe.height,
      ...(finalCut?.ok ? { expectedFrames: finalCut.finalFrames, actualFrames } : {}),
    });
    if (!qa.pass) {
      console.warn(`[masterQa] master FAILED quality gate (grade ${qa.grade}, score ${qa.score}):`, qa.issues.map((i) => i.code).join(', '));
      // Video Core v1.0 §7/§8 — a critical defect WITHHOLDS the master. It is not hosted, not returned, not stamped:
      // the route's saga fails on this throw, compensates the charge once, and records the attempt as failed. A
      // 29.7 s film that decodes to 890 frames is not "a film with a note", it is not the film that was paid for.
      throw new MasterQaRejected(qa);
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
    if (!url) {
      // The operator's hint stays in the log; the film's error card shows the sentence below (lib/ui/opFailure).
      console.error(`[assemble] master upload failed: ${(data.byteLength / 1048576).toFixed(1)} MB to ${RENDER_BUCKET} (storage refused the file or is unavailable: check the service-role key and the project upload size limit)`);
      throw new Error('The finished film could not be saved to storage.');
    }
    return { url, qa };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
