/**
 * lib/video/durationContract.ts — the FOUR lengths of one video request, kept apart on purpose (Video Core v1.0 §4).
 * Pure, client-safe; the one place the studio and the server read a requested length into a plan.
 *
 *   requestedSec   what the user asked for, as said („29.7 წამი", „ერთი წუთი"). Never changed without a word.
 *   nativeSec      what the provider grid renders: one Veo clip of 4 · 6 · 8 s, or scenes of 8 s (lib/video/duration). The
 *                  SMALLEST grid length that is not shorter than the request — ceil, never nearest and never floor: a
 *                  film shorter than asked is a silent cut, a film longer than asked is a trim the user can see.
 *   finalSec       what is delivered: the request, quantized to whole frames at VIDEO_FPS (29.7 s = 891 frames), reached
 *                  by trimming the native master. Equal to the request on the grid (24 → 24, 720 frames).
 *   trimSec        nativeSec − finalSec, what the trim removes; 0 when the request is on the grid.
 *
 * The defects this closes (the defect register, 2026-10-12): "60 → 64", "29.7 → 32", "70 → 72" — the NEAREST stop was sold
 * as the length (snapVideoSeconds rounds: 65 → 64 cut a second off a 65 s ask); "240 → 96" — the film ceiling, silently.
 * A length the open pipelines cannot make is a refusal with the reason, never a shorter film.
 *
 * The price is the NATIVE length (what is rendered; lib/video/createPanel videoQuote); the plan says so beside the trim.
 */
import {
  FILM_MAX_SEC, SCENE_SEC, SHORT_CLIP_SECS, VIDEO_MAX_SEC, VIDEO_MIN_SEC, formatVideoDuration, videoRoute, type VideoRoute,
} from './duration';

/** The timeline's frame rate: every delivered length is a whole number of these. */
export const VIDEO_FPS = 30;

/** Whole frames for a length at the timeline rate (29.7 s → 891). */
export function framesFor(seconds: number, fps: number = VIDEO_FPS): number {
  return Math.round(seconds * fps);
}

/** The length as the timeline can hold it: whole frames (29.7 → 29.7; 29.713 → 29.7). */
export function quantizeToFrames(seconds: number, fps: number = VIDEO_FPS): number {
  return framesFor(seconds, fps) / fps;
}

/**
 * The smallest grid length that is not shorter than the request: 5 → 6, 7.5 → 8, 29.7 → 32, 60 → 64, 65 → 72, 70 → 72,
 * 24 → 24, 240 → 240. Below one clip: 4. Above the longest film: the length itself (the caller refuses it).
 */
export function nativeGridSeconds(requestedSec: number): number {
  const r = Number(requestedSec);
  if (!Number.isFinite(r) || r <= SHORT_CLIP_SECS[0]!) return SHORT_CLIP_SECS[0]!;
  const clip = SHORT_CLIP_SECS.find((c) => r <= c);
  if (clip !== undefined) return clip;
  const scenes = Math.max(2, Math.ceil(r / SCENE_SEC - 1e-9));
  return scenes * SCENE_SEC;
}

export interface DurationCapabilities {
  /** The long-form pipeline (104 … 240 s) is open to this studio (lib/video/createPanel effectiveCapabilities). */
  longform: boolean;
  /** The longest film the server accepts, in seconds. */
  maxSeconds: number;
}

export type DurationBlock = 'too_short' | 'too_long' | 'longform_closed';

export interface DurationPlan {
  requestedSec: number;
  requestedFrames: number;
  nativeSec: number;
  /** How many provider clips the native master is (1 for a single clip). */
  sceneCount: number;
  /** One clip's length: the clip itself for 4 · 6 · 8 s, 8 s for every film. */
  clipSec: number;
  finalSec: number;
  finalFrames: number;
  trimSec: number;
  route: VideoRoute;
  /** 'trim': the native master is longer than the request and is cut to it; 'none': the request is on the grid. */
  deviation: 'none' | 'trim';
}

export type DurationVerdict =
  | { ok: true; plan: DurationPlan }
  | { ok: false; reason: DurationBlock; requestedSec: number; maxSec: number };

/**
 * The plan for a requested length, or the refusal: too short (under 4 s), too long (over 4 min), or a long-form length
 * (104 … 240 s) while that pipeline is closed to the studio — the answer is the reason and the longest open length, never
 * a 96 s film in place of a 240 s one.
 */
export function planFinalDuration(requestedSec: number, caps: DurationCapabilities): DurationVerdict {
  const r = Number(requestedSec);
  if (!Number.isFinite(r) || r < VIDEO_MIN_SEC) return { ok: false, reason: 'too_short', requestedSec: Number.isFinite(r) ? r : 0, maxSec: openMaxSeconds(caps) };
  if (r > VIDEO_MAX_SEC) return { ok: false, reason: 'too_long', requestedSec: r, maxSec: openMaxSeconds(caps) };
  const nativeSec = nativeGridSeconds(r);
  const route = videoRoute(nativeSec);
  if (route === 'longform' && (!caps.longform || nativeSec > caps.maxSeconds)) {
    return { ok: false, reason: 'longform_closed', requestedSec: r, maxSec: openMaxSeconds(caps) };
  }
  const finalFrames = framesFor(r);
  const finalSec = finalFrames / VIDEO_FPS;
  const trimSec = Math.max(0, Math.round((nativeSec - finalSec) * 1000) / 1000);
  const clipSec = nativeSec <= SCENE_SEC ? nativeSec : SCENE_SEC;
  return {
    ok: true,
    plan: {
      requestedSec: r,
      requestedFrames: finalFrames,
      nativeSec,
      sceneCount: nativeSec <= SCENE_SEC ? 1 : nativeSec / SCENE_SEC,
      clipSec,
      finalSec,
      finalFrames,
      trimSec,
      route,
      deviation: trimSec > 0 ? 'trim' : 'none',
    },
  };
}

/** The longest length the studio can order today. */
export function openMaxSeconds(caps: DurationCapabilities): number {
  return caps.longform ? Math.min(VIDEO_MAX_SEC, caps.maxSeconds) : FILM_MAX_SEC;
}

type Lang = 'ka' | 'en' | 'ru';
const lang = (l: string | null | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

/** A length with its fraction kept („29.7 წმ", "1:00"): the compact form drops nothing the user said. */
function exact(seconds: number, locale: string): string {
  if (Number.isInteger(seconds)) return formatVideoDuration(seconds, locale);
  const unit = lang(locale) === 'ka' ? 'წმ' : lang(locale) === 'ru' ? 'с' : 's';
  return `${Math.round(seconds * 1000) / 1000}${unit}`;
}

/**
 * „მოთხოვნილი 60 წმ · რენდერი 64 წმ (8 × 8 წმ) · საბოლოო 60 წმ (1800 კადრი, 4 წმ მოიჭრება)": the three lengths, said
 * before the price so a trim is never a surprise. On the grid: one length, no trim.
 */
export function describeDurationPlan(plan: DurationPlan, locale: string = 'ka'): string {
  const l = lang(locale);
  const scenes = plan.sceneCount > 1 ? ` (${plan.sceneCount} × ${formatVideoDuration(plan.clipSec, locale)})` : '';
  const req = exact(plan.requestedSec, locale);
  const nat = formatVideoDuration(plan.nativeSec, locale);
  const fin = exact(plan.finalSec, locale);
  if (plan.deviation === 'none') {
    return l === 'en' ? `Length ${fin}${scenes} · ${plan.finalFrames} frames`
      : l === 'ru' ? `Длина ${fin}${scenes} · ${plan.finalFrames} кадров`
        : `ხანგრძლივობა ${fin}${scenes} · ${plan.finalFrames} კადრი`;
  }
  const trim = exact(plan.trimSec, locale);
  return l === 'en' ? `Requested ${req} · Rendered ${nat}${scenes} · Final ${fin} (${plan.finalFrames} frames, ${trim} trimmed; priced at ${nat})`
    : l === 'ru' ? `Запрошено ${req} · Рендер ${nat}${scenes} · Итог ${fin} (${plan.finalFrames} кадров, обрезка ${trim}; цена за ${nat})`
      : `მოთხოვნილი ${req} · რენდერი ${nat}${scenes} · საბოლოო ${fin} (${plan.finalFrames} კადრი, ${trim} მოიჭრება; ფასი ${nat}-ზე)`;
}

/** Why a length cannot be made today, with the longest one that can — never a shorter film in its place. */
export function describeDurationBlock(v: Extract<DurationVerdict, { ok: false }>, locale: string = 'ka'): string {
  const l = lang(locale);
  const req = exact(v.requestedSec, locale);
  const max = formatVideoDuration(v.maxSec, locale);
  const min = formatVideoDuration(VIDEO_MIN_SEC, locale);
  if (v.reason === 'too_short') {
    return l === 'en' ? `${req} is shorter than the shortest clip (${min}).`
      : l === 'ru' ? `${req} короче самого короткого клипа (${min}).`
        : `${req} უმოკლეს კლიპზე (${min}) ნაკლებია.`;
  }
  if (v.reason === 'too_long') {
    return l === 'en' ? `${req} is longer than the longest video (${formatVideoDuration(VIDEO_MAX_SEC, locale)}).`
      : l === 'ru' ? `${req} длиннее самого длинного видео (${formatVideoDuration(VIDEO_MAX_SEC, locale)}).`
        : `${req} უგრძეს ვიდეოზე (${formatVideoDuration(VIDEO_MAX_SEC, locale)}) მეტია.`;
  }
  return l === 'en' ? `A ${req} film needs the long-form pipeline, which is not open yet. The longest film today is ${max}; nothing shorter was made in its place.`
    : l === 'ru' ? `Фильм ${req} требует длинноформатного конвейера, который ещё не открыт. Самый длинный фильм сегодня — ${max}; более короткий вместо него не создавался.`
      : `${req}-იანი ფილმი გრძელი ფორმის პაიპლაინს სჭირდება, რომელიც ჯერ არ არის ღია. დღეს უგრძესი ფილმი ${max}-ია; მის ნაცვლად უფრო მოკლე არ გაკეთებულა.`;
}

// ── The plan beside the panel's length, and the server's check of a final cut ──────────────────────────────

/**
 * The plan the panel says beside its length: only while a request is set, can be made, and the panel still holds the
 * native length it was planned on (the user picking another length drops the request). Null otherwise — the panel then
 * says one length, as before.
 */
export function activePlan(requestedSec: number | null | undefined, panelSec: number, caps: DurationCapabilities): DurationPlan | null {
  if (requestedSec === null || requestedSec === undefined) return null;
  const v = planFinalDuration(requestedSec, caps);
  if (!v.ok || v.plan.nativeSec !== panelSec) return null;
  return v.plan;
}

export type FinalCutRefusal = 'not_a_number' | 'off_frame_grid' | 'too_short' | 'longer_than_master' | 'trim_exceeds_scene';

export type FinalCutVerdict =
  | { ok: true; finalSec: number; finalFrames: number; trimSec: number }
  | { ok: false; reason: FinalCutRefusal; masterSec: number; finalSec: number | null };

/**
 * The server's check of a contracted final length against the master it is about to be cut from (the clips rendered,
 * added up): a whole number of frames at VIDEO_FPS, not shorter than the shortest clip, never longer than the master,
 * and a trim shorter than one scene (a trim of a whole scene or more means the wrong number of scenes was rendered —
 * the answer is this refusal, never a quiet cut). Nothing here changes the request; the caller answers with the reason.
 */
export function finalCutForAssemble(masterSec: number, finalDurationSec: unknown): FinalCutVerdict {
  const master = Number(masterSec);
  const f = typeof finalDurationSec === 'number' ? finalDurationSec : Number(finalDurationSec);
  const said = Number.isFinite(f) ? f : null;
  if (said === null || !Number.isFinite(master) || master <= 0) return { ok: false, reason: 'not_a_number', masterSec: master, finalSec: said };
  const finalFrames = framesFor(said);
  const finalSec = finalFrames / VIDEO_FPS;
  if (Math.abs(finalSec - said) > 1e-6) return { ok: false, reason: 'off_frame_grid', masterSec: master, finalSec: said };
  if (finalSec < VIDEO_MIN_SEC) return { ok: false, reason: 'too_short', masterSec: master, finalSec: said };
  if (finalSec > master + 1e-6) return { ok: false, reason: 'longer_than_master', masterSec: master, finalSec: said };
  const trimSec = Math.max(0, Math.round((master - finalSec) * 1000) / 1000);
  if (trimSec >= SCENE_SEC) return { ok: false, reason: 'trim_exceeds_scene', masterSec: master, finalSec: said };
  return { ok: true, finalSec, finalFrames, trimSec };
}
