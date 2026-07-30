/**
 * lib/services/montage/montagePlan.ts — the pure core of the Montage studio.
 *
 * PURE + TOTAL: no imports, no I/O, never throws. Everything here is timeline arithmetic, so it can be
 * unit-tested without ffmpeg, a network or a key.
 *
 * WHAT MONTAGE IS: several existing clips (and/or stills) cut into ONE edited master — ordering, per-shot
 * trims, transitions between shots, an optional music bed. It is deliberately NOT generative: no model is
 * called, which is why both billing tiers for this service are literally 'ffmpeg-local'.
 */

export type MontageAspect = '16:9' | '9:16' | '1:1';
export type MontageTransition = 'cut' | 'crossfade' | 'fade';

/** One shot on the timeline. `kind` decides whether it needs the still→clip bridge before stitching. */
export interface MontageShot {
  url: string;
  kind: 'video' | 'image';
  /** Trim window into the SOURCE, in seconds. Images ignore `start` and use `end - start` as their duration. */
  startSec: number;
  endSec: number;
  muted: boolean;
  /** Transition INTO this shot. Ignored on the first shot — there is nothing to transition from. */
  transition: MontageTransition;
  /** Optional burned-in caption for this shot. */
  caption?: string;
}

export interface MontageRequest {
  shots: MontageShot[];
  aspect: MontageAspect;
  /** Optional music bed laid under the whole master. */
  musicUrl?: string;
  /** How far the ORIGINAL clip audio is pushed down under the bed, in dB. */
  musicDuckDb: number;
  /** Drop every source's own audio and keep only the bed. */
  musicOnly: boolean;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  request?: MontageRequest;
}

/**
 * Shot cap. Sized against ENCODE TIME, not taste: `runSequence` builds one filtergraph with N inputs, and
 * every shot adds a decode + scale + pad chain. Twelve 1080p shots is already a multi-minute ultrafast
 * encode, and the route's budget is 600s including downloads and the upload. The existing single-clip
 * editor caps at 5; montage is the service where more shots is the entire point, so it gets a real cap
 * rather than inheriting that one.
 */
export const MAX_SHOTS = 12;
export const MIN_SHOTS = 2;

/** Per-shot bounds. Under 0.4s a crossfade has nothing to work with; over 60s it is not a montage shot. */
export const MIN_SHOT_SEC = 0.4;
export const MAX_SHOT_SEC = 60;

/** Total master ceiling, in seconds — the encode budget, not an artistic limit. */
export const MAX_TOTAL_SEC = 300;

/**
 * Maximum crossfade/fade length, in seconds.
 *
 * ⚠️ MIRRORS `XD` in lib/video/surgicalOps.ts `runSequence`. The transition length is decided THERE, not
 * passed in — `Transition` is a bare string. This constant and `transitionOverlap` below exist so the
 * timeline length computed here matches what ffmpeg actually produces. If XD changes, change this too:
 * a wrong total silently mis-sizes the bitrate cap and cuts the music bed at the wrong point.
 */
export const TRANSITION_MAX_SEC = 0.6;

export const ASPECT_DIMS: Record<MontageAspect, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 1080, h: 1080 },
};

export function isMontageAspect(v: unknown): v is MontageAspect {
  return v === '16:9' || v === '9:16' || v === '1:1';
}

export function isMontageTransition(v: unknown): v is MontageTransition {
  return v === 'cut' || v === 'crossfade' || v === 'fade';
}

/** Output length of one shot, after trimming. */
export function shotDuration(shot: MontageShot): number {
  return Math.max(0, shot.endSec - shot.startSec);
}

/**
 * How much a transition OVERLAPS the timeline, given the accumulated length so far and the incoming shot.
 *
 * ⚠️ EXACT MIRROR of `dd` in runSequence: `max(0.1, min(0.6, segDur/2, curDur/2))`. Note the 0.1 FLOOR —
 * a transition always eats at least 100ms even between very short shots, so this never returns 0. Note too
 * that the clamp is against the ACCUMULATED timeline, not the previous shot alone.
 */
export function transitionOverlap(accumulatedSec: number, shotSec: number): number {
  const dd = Math.max(0.1, Math.min(TRANSITION_MAX_SEC, shotSec / 2, accumulatedSec / 2));
  return Number(dd.toFixed(3));
}

/**
 * Total master length, folded the same way ffmpeg folds it. Overlapping transitions make this SHORTER than
 * the sum of the shots. The bitrate cap and the music bed are both sized on this number.
 */
export function timelineDuration(shots: readonly MontageShot[]): number {
  const first = shots[0];
  if (!first) return 0;
  let total = shotDuration(first);
  for (let i = 1; i < shots.length; i += 1) {
    const shot = shots[i];
    if (!shot) continue;
    const dur = shotDuration(shot);
    total += shot.transition === 'cut' ? dur : dur - transitionOverlap(total, dur);
  }
  return Number(Math.max(0, total).toFixed(3));
}

/** Billing units for this service are 'edits' — one montage render is one edit, regardless of shot count. */
export function montageUnits(): number {
  return 1;
}

/** Audio bitrate baked into surgicalOps' encode tail, in kbps — subtracted when sizing a video cap. */
const TAIL_AUDIO_KBPS = 192;

/** Storage ceiling to aim under. Mirrors MASTER_TARGET_MB in lib/orchestrator/ffmpeg-assembly.ts. */
export const MASTER_TARGET_MB = 42;

/**
 * Size a VBV cap so a master of `durationSec` lands near `targetMb`.
 *
 * WHY THIS EXISTS: 'ultrafast' is bitrate-inefficient, and an uncapped CRF20 master balloons past the
 * ~50MB Supabase project upload limit — the upload is then REJECTED after a full encode has already
 * burned the lambda's whole budget. The film pipeline hit this exact wall at 60s masters and fixed it the
 * same way. The floor keeps quality from collapsing on very long timelines.
 *
 * Policy lives here, in the pure leaf, rather than in surgicalOps: that module is a dumb ffmpeg executor
 * and takes the number it is given.
 */
export function maxrateForTarget(durationSec: number, targetMb = MASTER_TARGET_MB): number {
  const d = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 1;
  return Math.max(2_000, Math.round((targetMb * 8192) / d) - TAIL_AUDIO_KBPS);
}

function coerceShot(raw: unknown, index: number): { shot?: MontageShot; error?: string } {
  if (!raw || typeof raw !== 'object') return { error: `shot ${index + 1} must be an object` };
  const r = raw as Record<string, unknown>;

  const url = typeof r.url === 'string' ? r.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return { error: `shot ${index + 1} needs an http(s) url` };

  const kind = r.kind === 'image' ? 'image' : 'video';
  const startRaw = Number(r.startSec);
  const endRaw = Number(r.endSec);
  const startSec = Number.isFinite(startRaw) && startRaw > 0 ? startRaw : 0;
  // A still has no source timeline to trim, so a missing window means "show it for the default beat"
  // rather than an error the user cannot act on.
  const fallbackEnd = kind === 'image' ? startSec + 3 : startSec + 5;
  const endSec = Number.isFinite(endRaw) && endRaw > startSec ? endRaw : fallbackEnd;

  const dur = endSec - startSec;
  if (dur < MIN_SHOT_SEC) return { error: `shot ${index + 1} is shorter than ${MIN_SHOT_SEC}s` };
  if (dur > MAX_SHOT_SEC) return { error: `shot ${index + 1} is longer than ${MAX_SHOT_SEC}s` };

  const caption = typeof r.caption === 'string' ? r.caption.trim().slice(0, 120) : '';

  return {
    shot: {
      url,
      kind,
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(endSec.toFixed(3)),
      // A still image carries no audio track at all; marking it muted keeps the audio graph honest.
      muted: kind === 'image' ? true : r.muted === true,
      transition: isMontageTransition(r.transition) ? r.transition : 'cut',
      ...(caption ? { caption } : {}),
    },
  };
}

/**
 * Validate + normalize an inbound montage request. Total: never throws, always returns a verdict, so the
 * route can answer 400 with a reason a user can act on.
 */
export function validateMontageRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Record<string, unknown>;

  const rawShots = Array.isArray(b.shots) ? b.shots : null;
  if (!rawShots) return { ok: false, error: 'shots must be an array' };
  if (rawShots.length < MIN_SHOTS) return { ok: false, error: `a montage needs at least ${MIN_SHOTS} shots` };
  if (rawShots.length > MAX_SHOTS) return { ok: false, error: `a montage takes at most ${MAX_SHOTS} shots` };

  const shots: MontageShot[] = [];
  for (let i = 0; i < rawShots.length; i += 1) {
    const { shot, error } = coerceShot(rawShots[i], i);
    if (error || !shot) return { ok: false, error: error ?? `shot ${i + 1} is invalid` };
    shots.push(shot);
  }

  // The first shot has no predecessor, so a transition on it is meaningless — normalize it away rather
  // than letting the pipeline build a graph that fades in from nothing.
  const first = shots[0];
  if (first) first.transition = 'cut';

  const total = timelineDuration(shots);
  if (total > MAX_TOTAL_SEC) {
    return { ok: false, error: `the montage is ${Math.round(total)}s — the limit is ${MAX_TOTAL_SEC}s` };
  }
  // Belt and braces: every shot passed its own floor, so this can only trip on absurd input.
  if (total < MIN_SHOT_SEC) return { ok: false, error: 'the montage has no runtime' };

  const musicUrl = typeof b.musicUrl === 'string' ? b.musicUrl.trim() : '';
  if (musicUrl && !/^https?:\/\//i.test(musicUrl)) {
    return { ok: false, error: 'musicUrl must be an http(s) url' };
  }

  const duckRaw = Number(b.musicDuckDb);
  return {
    ok: true,
    request: {
      shots,
      aspect: isMontageAspect(b.aspect) ? b.aspect : '16:9',
      ...(musicUrl ? { musicUrl } : {}),
      // Clamped to a sane duck range; 0 would bury the dialogue, -40 would silence the bed's purpose.
      musicDuckDb: Number.isFinite(duckRaw) ? Math.max(-30, Math.min(0, duckRaw)) : -12,
      musicOnly: b.musicOnly === true,
    },
  };
}

/**
 * Build the `ConcatEntry` sequence that lib/video/surgicalOps consumes.
 *
 * Sources are addressed BY INDEX into the resolved-url array, and the pipeline may substitute a bridged
 * clip for a still, so this takes the already-resolved list and maps positionally. Keeping this pure means
 * the index arithmetic — the part that silently plays the wrong shot when it is wrong — is testable.
 */
/**
 * Structurally identical to `ConcatEntry` in lib/video/surgicalOps.ts. Declared here rather than imported
 * so this module stays a dependency-free leaf (surgicalOps is `server-only` and shells out to ffmpeg,
 * which would make this untestable). The route asserts the two line up at the call site.
 *
 * `transition` is the bare surgicalOps vocabulary — 'none' | 'crossfade' | 'fade' — NOT this module's
 * user-facing 'cut'. The rename is deliberate: 'cut' is what an editor calls it; 'none' is what the
 * filtergraph calls it, and mapping in one place beats mapping in three.
 */
export interface ConcatEntryPlan {
  src: number;
  start: number;
  end: number;
  muted: boolean;
  transition?: 'crossfade' | 'fade';
  textOverlay?: { text: string; position: 'bottom-center'; fontSize: number; fontColor: string };
}

/** Caption size relative to frame height — a fixed px size is illegible on 9:16 and huge on 1:1. */
export function captionFontSize(aspect: MontageAspect): number {
  return Math.round(ASPECT_DIMS[aspect].h * 0.045);
}

export function buildConcatPlan(
  shots: readonly MontageShot[],
  opts: { musicOnly?: boolean; aspect?: MontageAspect } = {},
): ConcatEntryPlan[] {
  const fontSize = captionFontSize(opts.aspect ?? '16:9');
  return shots.map((shot, i) => {
    // A bridged still starts at 0 in its generated clip, not at the still's notional source offset.
    const dur = shotDuration(shot);
    const start = shot.kind === 'image' ? 0 : shot.startSec;
    const end = shot.kind === 'image' ? dur : shot.endSec;

    return {
      src: i,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      // musicOnly silences every source so only the bed survives the mix.
      muted: opts.musicOnly === true ? true : shot.muted,
      // The first shot never carries a transition — validate() already normalized it to 'cut'.
      ...(shot.transition !== 'cut' ? { transition: shot.transition } : {}),
      ...(shot.caption
        ? { textOverlay: { text: shot.caption, position: 'bottom-center' as const, fontSize, fontColor: '#FFFFFF' } }
        : {}),
    };
  });
}
