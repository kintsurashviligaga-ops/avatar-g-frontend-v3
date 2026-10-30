/**
 * lib/video/directClip.ts — the video service as ONE clip, the way Gemini makes a video (GG, 2026-10-25 16:10Z). Pure and
 * client-safe: the chat's approval card, the quick chips and POST /api/video/clip all read these functions.
 *
 * What GG asked for, and what each rule below is for:
 *   · „სტანდარტული დრო 8 წამი" — one clip of 4, 6, 8 or 10 s, 8 by default; nothing grows it on its own (the old chat path
 *     guessed 16 or 24 s from the prompt's word count) and longer films are not offered here (GG's card 16:21Z, „და 10").
 *   · 4 / 6 / 8 s are Veo 3.1 (its own grid); 10 s is Gemini Omni Flash on Vertex (GG's card 16:51Z: 720p ✦69, 1080p ✦102).
 *   · „პერსონაჟებს ერთი ხმა ახმოვანებდა" (GG 2026-10-26 10:44Z) — a clip in which a character says a GEORGIAN line is
 *     Gemini Omni Flash's at every length (`speech: 'ka'`): Omni says it in that character's own voice, lips in sync. Veo
 *     cannot say Georgian, and the one Cloud TTS voice that used to be laid over its mouth spoke for every character. Its
 *     price is the price book's Omni row for the length and resolution (lib/video/clipPrompt says why).
 *   · „საწყის ატვირთულ ფოტოს … ცვლის" — one photo IS the clip's first frame; two or three are Veo's reference images.
 *     No storyboard frame is drawn in its place.
 *   · the prompt is the user's own: translated for Veo, never rewritten into a different scenario (lib/video/clipSpeech).
 *   · „ხარისხი გაურკვევლად წერია" — the quality is said as a resolution and a frame size (Veo renders 720p at every length,
 *     1080p at 8 s only; it has no 480p. Omni is 720p or 1080p at every length, the user's pick).
 *   · no sound / music / subtitle / narrator switches: the engine's own sound follows the prompt.
 *
 * ⚠️ THE PRICE IS TODAY'S PRICE FOR THE SAME LENGTH AND TIER: videoCredits({ seconds, quality, scenes: 1 }), the number the
 * composer has always quoted for a one-clip video (lib/credits/quote). An Omni clip is the price book's omniClip row for its
 * length and resolution, set on GG's cards. No other price constant (prices move only on GG's word).
 */
import { omniClipCredits } from '@/lib/credits/priceBook';
import { videoCredits, type VideoQuality } from '@/lib/credits/videoPricing';

export const DIRECT_CLIP_SECONDS = [4, 6, 8, 10] as const;
export type DirectClipSeconds = (typeof DIRECT_CLIP_SECONDS)[number];
export const DIRECT_CLIP_DEFAULT_SECONDS: DirectClipSeconds = 8;

/** The engine a clip renders on: Veo 3.1 for its 4 / 6 / 8 s grid, Gemini Omni Flash for 10 s or a Georgian line. */
export type DirectClipEngine = 'veo' | 'omni';
/** 'ka' when a character in the clip says a Georgian line (lib/video/clipPrompt promptSpeaksGeorgian / speaksGeorgian). */
export type DirectClipSpeech = 'ka' | null;
export const directClipEngine = (seconds: number, speech?: DirectClipSpeech): DirectClipEngine => (seconds === 10 || speech === 'ka' ? 'omni' : 'veo');

/** Veo's own limit: a first frame, or up to three reference images (reference mode renders 8 s, never on Lite). */
export const DIRECT_CLIP_MAX_PHOTOS = 3;
export const DIRECT_CLIP_PROMPT_MAX = 2_000;
/** One photo's bytes. The browser sends them downscaled (≤ 1280 px JPEG, a few hundred KB); this is the ceiling. */
export const DIRECT_CLIP_PHOTO_MAX_BYTES = 1_000_000;
/**
 * The whole JSON body POST /api/video/clip reads: three photos at their ceiling as base64 (4 MB) and the words, under
 * Vercel's 4.5 MB request limit. ⚠️ The route used to read at most 64 KB (lib/studio/http readJson's default), so ANY
 * clip with a photo was refused as an empty request (GG's E2E, 2026-10-25 20:00Z) — the mocked browser tests never saw it.
 */
export const DIRECT_CLIP_BODY_MAX_BYTES = 4_400_000;

export type DirectClipAspect = '9:16' | '16:9';
export type DirectClipResolution = '720p' | '1080p';
/** An Omni clip's resolution when none is picked and nobody speaks Georgian (10 s): the cheaper one (1080p is a tap away). */
export const OMNI_DEFAULT_RESOLUTION: DirectClipResolution = '720p';
/**
 * A clip in which a character speaks Georgian, when no resolution is picked: 1080p, as Veo's 8 s was (GG 2026-10-26
 * 10:44Z: „ხარისხი არ ვარგა"). 720p is a tap away, cheaper.
 */
export const OMNI_SPEECH_DEFAULT_RESOLUTION: DirectClipResolution = '1080p';

/**
 * Any typed, stored or chosen length → the clip length it renders: 4, 6, 8, or 10 when exactly 10 is chosen. Garbage, 9 and
 * anything longer (a template's 24 s, an old 48 s film) → 8: a longer stored length never becomes the dearer 10 s on its own.
 */
export function snapDirectClipSeconds(value: unknown): DirectClipSeconds {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DIRECT_CLIP_DEFAULT_SECONDS;
  if (n === 10) return 10;
  return n < 5 ? 4 : n < 7 ? 6 : 8;
}

/**
 * Two or three photos are Veo's reference images, which render 8 s only (Omni takes one photo, as its first frame);
 * one photo or none keeps the chosen length.
 */
export function directClipSeconds(seconds: unknown, photos: number): DirectClipSeconds {
  return photos >= 2 ? 8 : snapDirectClipSeconds(seconds);
}

/**
 * The resolution a clip renders at. Veo: 1080p at 8 s, 720p at 4 and 6 s (lib/veo/capabilities' resolution map). Omni (10 s,
 * or a Georgian line at any length): the one picked; unpicked, 1080p for a Georgian line and 720p for a 10 s without one.
 */
export function directClipResolution(seconds: number, omniResolution?: DirectClipResolution | null, speech?: DirectClipSpeech): DirectClipResolution {
  const s = snapDirectClipSeconds(seconds);
  if (directClipEngine(s, speech) === 'omni') {
    if (omniResolution === '720p' || omniResolution === '1080p') return omniResolution;
    return speech === 'ka' ? OMNI_SPEECH_DEFAULT_RESOLUTION : OMNI_DEFAULT_RESOLUTION;
  }
  return s === 8 ? '1080p' : '720p';
}

/** The frame in pixels — what the quality row prints next to the resolution. */
export function directClipFrame(aspect: DirectClipAspect, seconds: number, omniResolution?: DirectClipResolution | null, speech?: DirectClipSpeech): { width: number; height: number } {
  const short = directClipResolution(seconds, omniResolution, speech) === '1080p' ? 1080 : 720;
  const long = short === 1080 ? 1920 : 1280;
  return aspect === '16:9' ? { width: long, height: short } : { width: short, height: long };
}

/** Lite takes no reference images: with two or three photos it is not offered. */
export function directClipTierAllowed(tier: VideoQuality, photos: number): boolean {
  return !(tier === 'lite' && photos >= 2);
}

/**
 * Credits for one clip. Veo: the same function the composer quotes and the film price book bills by (the tier counts).
 * Omni (10 s, or a Georgian line): the price book's omniClip row for its length and resolution (the tier does not apply).
 */
export function directClipCredits(input: { seconds: unknown; tier: VideoQuality; photos: number; resolution?: DirectClipResolution | null; speech?: DirectClipSpeech }): number {
  const seconds = directClipSeconds(input.seconds, input.photos);
  if (directClipEngine(seconds, input.speech) === 'omni') return omniClipCredits(directClipResolution(seconds, input.resolution, input.speech), seconds);
  return videoCredits({ seconds, quality: input.tier, scenes: 1, referenceMode: input.photos >= 2 });
}

/** „1080p · 1080×1920" — the quality as GG asked for it, resolution first. */
export function directClipQualityLabel(aspect: DirectClipAspect, seconds: number, omniResolution?: DirectClipResolution | null, speech?: DirectClipSpeech): string {
  const { width, height } = directClipFrame(aspect, seconds, omniResolution, speech);
  return `${directClipResolution(seconds, omniResolution, speech)} · ${width}×${height}`;
}

/**
 * A Georgian clip's Cloud TTS line and the clip with it, at fixed paths in `renders`: the job's uuid finds both again. Only
 * clips started before 2026-10-26 have one (`::c8v`); a Georgian line is Omni's own voice since.
 */
export const clipVoicePath = (uuid: string): string => `video-clip/${uuid}/voice.mp3`;
export const clipVoicedPath = (uuid: string): string => `video-clip/${uuid}/voiced.mp4`;
/** An Omni clip, hosted once at a fixed path in `renders` (a re-poll re-signs it). */
export const clipOmniPath = (uuid: string): string => `video-clip/${uuid}/omni.mp4`;

// ─── The request the chat sends ──────────────────────────────────────────────────────────────────────────────────

export interface DirectClipPhoto { base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }

export interface DirectClipRequest {
  prompt: string;
  aspect: DirectClipAspect;
  seconds: DirectClipSeconds;
  /** Veo's tier (4 / 6 / 8 s). An Omni clip keeps it but does not use it. */
  tier: VideoQuality;
  /** The resolution an Omni clip renders at; Veo's lengths set their own (directClipResolution). */
  resolution: DirectClipResolution;
  /** What the card read: 'ka' when a character says a Georgian line, so it showed Omni's price (the route reads again). */
  speech: DirectClipSpeech;
  /** The resolution the card sent, if any (an Omni clip renders it; directClipResolution decides when none). */
  picked: DirectClipResolution | null;
  photos: DirectClipPhoto[];
  /** The price the card showed; a different server price is refused before any charge (409 price_changed). */
  expectedCredits: number | null;
}

export type DirectClipParse =
  | { ok: true; value: DirectClipRequest }
  | { ok: false; field: 'prompt' | 'aspect' | 'seconds' | 'tier' | 'resolution' | 'photos' | 'speech' | 'expectedCredits'; code: 'required' | 'too_long' | 'invalid' | 'too_many' | 'too_large' | 'lite_photos' };

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/** The bytes a base64 string decodes to (its `=` padding is not data). The browser counts a photo the same way. */
export function base64Bytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

/** A photo as the browser sends it: a base64 data URL of a JPEG, PNG or WebP. Null for anything else. */
export function parseClipPhoto(v: unknown): DirectClipPhoto | 'too_large' | null {
  if (typeof v !== 'string') return null;
  const m = DATA_URL.exec(v.trim());
  if (!m) return null;
  const base64 = m[2]!;
  if (base64Bytes(base64) > DIRECT_CLIP_PHOTO_MAX_BYTES) return 'too_large';
  return { base64, mimeType: m[1] as DirectClipPhoto['mimeType'] };
}

/**
 * The body POST /api/video/clip accepts. Strict and free: a bad field is refused here, before the rate limit, the voice
 * and the charge. The prompt keeps its words; only runs of whitespace are folded.
 */
export function parseDirectClipRequest(raw: unknown): DirectClipParse {
  const b = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const prompt = typeof b.prompt === 'string' ? b.prompt.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : '';
  if (!prompt) return { ok: false, field: 'prompt', code: 'required' };
  if (prompt.length > DIRECT_CLIP_PROMPT_MAX) return { ok: false, field: 'prompt', code: 'too_long' };

  const aspect = b.aspect === undefined || b.aspect === null || b.aspect === '' ? '9:16' : b.aspect;
  if (aspect !== '9:16' && aspect !== '16:9') return { ok: false, field: 'aspect', code: 'invalid' };

  const rawSec = b.seconds === undefined || b.seconds === null ? DIRECT_CLIP_DEFAULT_SECONDS : b.seconds;
  if (!(DIRECT_CLIP_SECONDS as readonly unknown[]).includes(rawSec)) return { ok: false, field: 'seconds', code: 'invalid' };

  const tier = b.tier === undefined || b.tier === null || b.tier === '' ? 'fast' : b.tier;
  if (tier !== 'lite' && tier !== 'fast' && tier !== 'standard') return { ok: false, field: 'tier', code: 'invalid' };

  if (b.speech !== undefined && b.speech !== null && b.speech !== 'ka') return { ok: false, field: 'speech', code: 'invalid' };
  const speech: DirectClipSpeech = b.speech === 'ka' ? 'ka' : null;

  const picked = b.resolution === undefined || b.resolution === null || b.resolution === '' ? null : b.resolution;
  if (picked !== null && picked !== '720p' && picked !== '1080p') return { ok: false, field: 'resolution', code: 'invalid' };

  const list = b.photos === undefined || b.photos === null ? [] : b.photos;
  if (!Array.isArray(list)) return { ok: false, field: 'photos', code: 'invalid' };
  if (list.length > DIRECT_CLIP_MAX_PHOTOS) return { ok: false, field: 'photos', code: 'too_many' };
  const photos: DirectClipPhoto[] = [];
  for (const item of list) {
    const p = parseClipPhoto(item);
    if (p === 'too_large') return { ok: false, field: 'photos', code: 'too_large' };
    if (!p) return { ok: false, field: 'photos', code: 'invalid' };
    photos.push(p);
  }
  const seconds = directClipSeconds(rawSec, photos.length);
  // Lite takes no reference images; an Omni clip has no tier, so its Lite is not a refusal.
  if (directClipEngine(seconds, speech) === 'veo' && !directClipTierAllowed(tier, photos.length)) return { ok: false, field: 'tier', code: 'lite_photos' };

  const ec = b.expectedCredits;
  if (ec !== undefined && ec !== null && !(typeof ec === 'number' && Number.isInteger(ec) && ec >= 0)) return { ok: false, field: 'expectedCredits', code: 'invalid' };

  return {
    ok: true,
    value: {
      prompt, aspect, tier, photos, seconds, speech,
      // Veo's lengths set their own resolution; only an Omni clip keeps the one asked for. The pick itself is kept for an
      // Omni clip the route finds a Georgian line in (directClipResolution again, with speech).
      resolution: directClipResolution(seconds, picked, speech),
      picked,
      expectedCredits: typeof ec === 'number' ? ec : null,
    },
  };
}
