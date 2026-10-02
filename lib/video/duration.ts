/**
 * lib/video/duration.ts — how long a film may be, in ONE place. Pure and client-safe.
 *
 * The owner's rule (2026-10-02): a video is 4 seconds to 4 minutes. Not a slider you can drag anywhere — the render
 * grids below are what the engines can actually produce, so every length the UI offers is one the server will accept,
 * and anything else is refused (or snapped) by the same functions.
 *
 *   4 · 6 · 8 s        ONE Veo clip. Veo's native lengths are 4, 6 and 8 (lib/veo/capabilities.ts); 4 s is the floor.
 *   16 … 96 s          the FILM pipeline: 2 … 12 scenes of 8 s (planSegmentCount's MAX_SEGMENTS = 12), stitched.
 *   104 … 240 s        the LONG-FORM pipeline: 13 … 30 scenes of 8 s in acts (lib/video/longform). Dark until
 *                      LONGFORM_VIDEO_ENABLED + its migration — `videoRoute` says which pipeline a length needs, and the
 *                      caller asks the server whether that pipeline is open (the UI shows the length locked, never
 *                      pretends it will render).
 *
 * ⚠️ LENGTHS ARE MULTIPLES OF 8 ABOVE 8 ON PURPOSE. A scene is one Veo clip and Veo only renders 8 s at 1080p, so a
 * "60 s" film would be 7.5 scenes. The slider's stops are the lengths a film really has.
 */

export const VIDEO_MIN_SEC = 4;
export const VIDEO_MAX_SEC = 240;

/** Veo's native clip lengths — a film shorter than one scene is a single clip of exactly this long. */
export const SHORT_CLIP_SECS: readonly number[] = [4, 6, 8];

/** Every film longer than one clip is made of scenes this long. */
export const SCENE_SEC = 8;

/** The film pipeline's ceiling (its server-side planSegmentCount clamps to 12 scenes). */
export const FILM_MAX_SCENES = 12;
export const FILM_MAX_SEC = FILM_MAX_SCENES * SCENE_SEC; // 96

/** The shortest film that needs the long-form pipeline. */
export const LONGFORM_FROM_SEC = FILM_MAX_SEC + SCENE_SEC; // 104

export type VideoRoute = 'single' | 'film' | 'longform';

/** Every length the studio offers, ascending: 4, 6, 8, 16, 24 … 240 (32 stops). */
export const VIDEO_DURATION_STOPS: readonly number[] = Object.freeze([
  ...SHORT_CLIP_SECS,
  ...Array.from({ length: (VIDEO_MAX_SEC - SCENE_SEC * 2) / SCENE_SEC + 1 }, (_, i) => SCENE_SEC * 2 + i * SCENE_SEC),
]);

/** The one-tap lengths shown as chips (all stops). */
export const VIDEO_DURATION_PRESETS: readonly number[] = Object.freeze([4, 8, 24, 48, 96, 240]);

export function isVideoSeconds(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return false;
  if (SHORT_CLIP_SECS.includes(value)) return true;
  return value >= SCENE_SEC * 2 && value <= VIDEO_MAX_SEC && value % SCENE_SEC === 0;
}

/** The nearest offered length to anything typed, dragged or stored. NaN / garbage → the 8 s default clip. */
export function snapVideoSeconds(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 8;
  const c = Math.min(VIDEO_MAX_SEC, Math.max(VIDEO_MIN_SEC, n));
  if (c <= 8) return c < 5 ? 4 : c < 7 ? 6 : 8;
  // Nearest multiple of 8, never below 16 once past one clip (9 … 11 round DOWN to the 8 s clip instead).
  const stop = Math.round(c / SCENE_SEC) * SCENE_SEC;
  return stop < SCENE_SEC * 2 ? 8 : Math.min(VIDEO_MAX_SEC, stop);
}

/** Which pipeline renders a film of this length. */
export function videoRoute(seconds: number): VideoRoute {
  const s = snapVideoSeconds(seconds);
  if (s <= SCENE_SEC) return 'single';
  return s <= FILM_MAX_SEC ? 'film' : 'longform';
}

/** How many scenes (= Veo clips) a film of this length is: 1 up to 8 s, then length / 8. */
export function sceneCountForSeconds(seconds: number): number {
  const s = snapVideoSeconds(seconds);
  return s <= SCENE_SEC ? 1 : s / SCENE_SEC;
}

/** One scene's length: the clip itself for 4 / 6 / 8 s, 8 s for every longer film. */
export function clipSecForSeconds(seconds: number): number {
  const s = snapVideoSeconds(seconds);
  return s <= SCENE_SEC ? s : SCENE_SEC;
}

/** Index of the stop nearest a length — what a range input's integer value maps to. */
export function durationStopIndex(seconds: number): number {
  const s = snapVideoSeconds(seconds);
  return VIDEO_DURATION_STOPS.indexOf(s);
}

type Lang = 'ka' | 'en' | 'ru';
const SEC_WORD: Record<Lang, string> = { ka: 'წმ', en: 's', ru: 'с' };
const MIN_WORD: Record<Lang, string> = { ka: 'წთ', en: 'min', ru: 'мин' };
const lang = (l: string | null | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

/** "4s" · "48s" · "1:36" · "4:00" — compact, and the same digits in every language. */
export function formatVideoDuration(seconds: number, locale: string = 'en'): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}${SEC_WORD[lang(locale)]}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1 min 36 s" spelled out, for screen readers and the price tooltip. */
export function spokenVideoDuration(seconds: number, locale: string = 'en'): string {
  const l = lang(locale);
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} ${SEC_WORD[l]}`;
  return r === 0 ? `${m} ${MIN_WORD[l]}` : `${m} ${MIN_WORD[l]} ${r} ${SEC_WORD[l]}`;
}
