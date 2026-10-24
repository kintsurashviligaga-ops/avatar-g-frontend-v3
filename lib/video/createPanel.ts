/**
 * lib/video/createPanel.ts — the video create screen's logic, pure and client-safe (no React, no env, no I/O).
 *
 * The screen (components/studio/create/VideoCreatePanel) is only a view over the functions below, so the things that
 * must agree — the number on the Generate button, the lengths the picker offers, which of them are open, the
 * resolution a clip renders at — are decided HERE once and pinned by createPanel.test.ts.
 *
 * ⚠️ THE PRICE IS NEVER COMPUTED IN A COMPONENT. `videoQuote` is `quoteCredits({tool:'video', …})` (lib/credits/quote.ts →
 * videoCredits, by the second); the server charges the film through videoCredits with the same three inputs (seconds ×
 * Veo tier × mode), so the number on the button is the number taken. A request body NEVER carries a price.
 */
import { creditsLabel, quoteCredits } from '@/lib/credits/quote';
import { MUSIC_VIDEO_MULT, VIDEO_QUALITY_MULT, type VideoMode, type VideoQuality } from '@/lib/credits/videoPricing';
import { TRIAL } from '@/lib/billing/tiers';
import { resolutionFor } from '@/lib/veo/capabilities';
import type { VeoResolution } from '@/lib/veo/types';
import { planSceneDialogue } from '@/lib/chat/sceneDialogue';
import {
  FILM_MAX_SEC,
  VIDEO_DURATION_STOPS,
  VIDEO_MAX_SEC,
  clipSecForSeconds,
  sceneCountForSeconds,
  snapVideoSeconds,
  videoRoute,
  type VideoRoute,
} from './duration';

// ── Quality tiers ─────────────────────────────────────────────────────────────────────────────────────────

/** Cheapest first — the order the model list and the quality row read in. */
export const VIDEO_TIERS: readonly VideoQuality[] = Object.freeze(['lite', 'fast', 'standard'] as VideoQuality[]);

/** The hero card's big title per Veo tier (brand names — not translated). */
export const VIDEO_TIER_TITLE: Readonly<Record<VideoQuality, string>> = Object.freeze({
  lite: 'VEO 3.1 LITE',
  fast: 'VEO 3.1 FAST',
  standard: 'VEO 3.1',
});

/** What a tier does to the price, against Fast: -40 % · 0 · +230 % (VIDEO_QUALITY_MULT is the one source). */
export function tierPriceEffect(tier: VideoQuality): { multiplier: number; deltaPct: number } {
  const multiplier = VIDEO_QUALITY_MULT[tier];
  return { multiplier, deltaPct: Math.round((multiplier - 1) * 100) };
}

// ── The price ─────────────────────────────────────────────────────────────────────────────────────────────

export interface VideoQuoteArgs {
  seconds: number;
  tier: VideoQuality;
  mode: VideoMode;
}

/** The credits ONE press of Generate costs — the Generate button's number. */
export function videoQuote({ seconds, tier, mode }: VideoQuoteArgs): number {
  return quoteCredits({ tool: 'video', seconds, quality: tier, mode });
}

export interface LipsyncAddOnArgs {
  mode: VideoMode;
  /** The music video's Lip-sync switch (OmniStudio `videoLipsync`). */
  lipsyncOn: boolean;
  /** A documentary film has typed dialogue (OmniStudio `videoSpeech`) — the talking-head pass speaks it. */
  hasDialogue: boolean;
  /** Veo renders the film's own sound (the Veo plan's `nativeAudio` / `generateAudio`), so it says the typed line in-clip. */
  veoSpeaks?: boolean;
}

/**
 * Veo says the documentary's typed character line itself: Veo's sound is on and the line fits the film's scenes the way
 * filmComposite places it (planSceneDialogue: one line per scene, each a speakable line of at most 200 characters, all
 * or nothing). When it does not fit, filmComposite keeps its old voice path, so callers must too.
 */
export function veoSpeaksTypedLine({ speech, sceneCount, nativeAudio }: { speech: string; sceneCount: number; nativeAudio: boolean }): boolean {
  if (!nativeAudio || !speech.trim()) return false;
  const plan = planSceneDialogue({ sceneCount, clipSec: 8, script: speech });
  return plan.complete && plan.placed > 0;
}

export interface NarrationCueArgs {
  mode: VideoMode;
  /** The Narration chip (OmniStudio `videoNarration`, on by default). */
  narrationOn: boolean;
  /** Narration in the user's own trained voice (`videoMyVoiceNarration && hasTrainedVoice`). */
  myVoiceNarration: boolean;
  /** Veo will say the typed "What the character says" line in-clip (veoSpeaksTypedLine). */
  characterLineOnVeo: boolean;
}

/**
 * Whether the film brief gets the narrator cue (OmniStudio `t.narrationCue`, "with professional spoken voice-over
 * narration"). ⚠️ The cue is what tells filmComposite the typed line is a NARRATOR's (wantsCommentary): with the chip on by
 * default, a line typed into "What the character says" was read by an off-screen voice instead of the character, and
 * Veo was never given it. So when Veo will say that line on screen, the chip no longer turns it into a voice-over. The
 * user's own trained voice is an explicit pick and keeps the cue; a music video never has one.
 */
export function narrationCueApplies({ mode, narrationOn, myVoiceNarration, characterLineOnVeo }: NarrationCueArgs): boolean {
  if (mode !== 'documentary') return false;
  if (myVoiceNarration) return true;
  return narrationOn && !characterLineOnVeo;
}

/**
 * Whether the film runs the lip-sync pass after it assembles — OmniStudio's `wantsLipsync`.
 *
 * A music video: when its Lip-sync switch is on (the singer). A documentary: when it has typed dialogue AND its own clips
 * cannot say it. ⚠️ With Veo's sound on, Veo speaks the line inside the clip with the film's own face (filmComposite
 * delegates it); the documentary talking head (a HeyGen photo + an ElevenLabs voice, cut in over a scene) then put a
 * SECOND, different face on screen saying the same words, replaced a scene, and charged the add-on for it.
 */
export function filmLipsyncRuns({ mode, lipsyncOn, hasDialogue, veoSpeaks = false }: LipsyncAddOnArgs): boolean {
  if (mode === 'musicvideo') return lipsyncOn;
  return hasDialogue && !veoSpeaks;
}

/**
 * The lip-sync pass a film runs after it assembles, in credits — 0 when this film would not run one.
 *
 * It is NOT part of the film's price: OmniStudio starts it as its own /api/video/lipsync job (the singer for a music
 * video with Lip-sync on, the talking head for a documentary with dialogue its clips cannot speak), and that route reserves
 * the avatar price (`quoteCredits({tool:'avatar'})` = creditCostFor('avatar'), what it deducts) when the job starts and
 * refunds it when the render fails. A free first film still pays this. So the quote shows it NEXT TO the Generate number,
 * never inside it. Same condition as OmniStudio's `wantsLipsync` (filmLipsyncRuns).
 */
export function lipsyncAddOnCredits(args: LipsyncAddOnArgs): number {
  return filmLipsyncRuns(args) ? quoteCredits({ tool: 'avatar' }) : 0;
}

/**
 * Whether the finished film gets the music-video graphics pass (/api/video/graphics: an equalizer, a "LIVE" title card,
 * the "MyAvatar.ge Originals" music bug, burned-in subtitles). A music video only. ⚠️ It used to run on EVERY film, so a
 * documentary or an advert came back with a concert overlay nobody asked for, swapped in after the clean film was
 * already shown, and the studio's job stayed open until that ffmpeg pass ended.
 */
export function filmGraphicsRuns(mode: VideoMode): boolean {
  return mode === 'musicvideo';
}

/** The line under Generate that names the lip-sync charge: when it is taken, and that a failed pass gives it back. */
export function lipsyncAddOnNote(credits: number, locale: string): string {
  const n = creditsLabel(credits, locale);
  if (locale === 'en') return `+${n} for lip-sync — taken only if it runs, returned if it fails`;
  if (locale === 'ru') return `+${n} за липсинк — списываются, только если он запустится; при сбое возвращаются`;
  return `+${n} ლიპსინკისთვის — ჩამოიჭრება მხოლოდ თუ შესრულდება, ჩავარდნისას ბრუნდება`;
}

export interface VideoPriceRow {
  tier: VideoQuality;
  /** The price of each length for this tier, in `lengths` order. */
  prices: { seconds: number; credits: number }[];
}

/** The lengths the "Models & prices" table shows — the picker's presets that the film pipeline renders today. */
export const PRICE_TABLE_LENGTHS: readonly number[] = Object.freeze([4, 8, 24, 48, FILM_MAX_SEC]);

/** The model list's rows (cheapest tier first), each priced by `videoQuote` for every length. */
export function videoPriceRows(mode: VideoMode, lengths: readonly number[] = PRICE_TABLE_LENGTHS): VideoPriceRow[] {
  return VIDEO_TIERS.map((tier) => ({
    tier,
    prices: lengths.map((seconds) => ({ seconds, credits: videoQuote({ seconds, tier, mode }) })),
  }));
}

/** The music-video surcharge as a percentage (MUSIC_VIDEO_MULT = 1.4 → 40). */
export const MUSIC_VIDEO_SURCHARGE_PCT = Math.round((MUSIC_VIDEO_MULT - 1) * 100);

// ── What the server will accept right now ─────────────────────────────────────────────────────────────────

/** GET /api/video/capabilities — which lengths the server can render today. */
export interface VideoCapabilities {
  /** The long-form pipeline (104 … 240 s) is open: enabled AND priced. */
  longform: boolean;
  /** The longest film the server accepts, in seconds. */
  maxSeconds: number;
}

/** Until the server answers — and whenever it cannot be reached — long-form is CLOSED: a lock is never wrongly opened. */
export const CLOSED_CAPABILITIES: VideoCapabilities = Object.freeze({ longform: false, maxSeconds: FILM_MAX_SEC });

/**
 * ⚠️ THE STUDIO CANNOT ORDER A LONG-FORM FILM YET, so it keeps those lengths locked even when the server says the pipeline is
 * open. Opening them needs four things the create screen does not have: (1) the button's price — long-form is priced per
 * scene from LONGFORM_MARGIN (plan.creditsForUsd), not by videoCredits, so the number on the button would not be the
 * number on the bill unless the server hands the quote to the client; (2) reference photos as public https URLs (ours are
 * data URLs the film route hosts itself); (3) a progress/result surface for a film that takes tens of minutes and survives a
 * closed tab (GET /api/video/longform/[id]); (4) a way to test any of it without paid calls — the pipeline's migration is
 * unapplied and its cron is not in vercel.json. Flip this to `true` only together with all four.
 */
export const LONGFORM_ORDER_WIRED = false;

/** What the picker actually honours: the server's answer, but never more than the studio can order. */
export function effectiveCapabilities(server: VideoCapabilities, wired: boolean = LONGFORM_ORDER_WIRED): VideoCapabilities {
  return wired ? server : CLOSED_CAPABILITIES;
}

/** The answer of /api/video/capabilities as the client reads it. Anything unexpected reads as closed. */
export function parseVideoCapabilities(raw: unknown): VideoCapabilities {
  if (!raw || typeof raw !== 'object') return CLOSED_CAPABILITIES;
  const r = raw as { longform?: unknown; maxSeconds?: unknown };
  if (r.longform !== true) return CLOSED_CAPABILITIES;
  const max = typeof r.maxSeconds === 'number' && Number.isFinite(r.maxSeconds) ? r.maxSeconds : VIDEO_MAX_SEC;
  return { longform: true, maxSeconds: Math.min(VIDEO_MAX_SEC, Math.max(FILM_MAX_SEC, Math.floor(max))) };
}

/** True when the picker must show this length locked ("opening soon"): it needs the long-form pipeline and that is not open. */
export function isLengthLocked(seconds: number, caps: VideoCapabilities): boolean {
  const s = snapVideoSeconds(seconds);
  if (videoRoute(s) !== 'longform') return false;
  return !caps.longform || s > caps.maxSeconds;
}

export interface DurationOption {
  seconds: number;
  route: VideoRoute;
  scenes: number;
  locked: boolean;
}

/** Every stop of the picker with its route and whether it is open — the slider walks this list. */
export function durationOptions(caps: VideoCapabilities): DurationOption[] {
  return VIDEO_DURATION_STOPS.map((seconds) => ({
    seconds,
    route: videoRoute(seconds),
    scenes: sceneCountForSeconds(seconds),
    locked: isLengthLocked(seconds, caps),
  }));
}

/** Index (into VIDEO_DURATION_STOPS) of the longest open length — the slider's maximum. */
export function lastOpenStopIndex(caps: VideoCapabilities): number {
  let last = 0;
  VIDEO_DURATION_STOPS.forEach((s, i) => { if (!isLengthLocked(s, caps)) last = i; });
  return last;
}

/** A stored or typed length, snapped to the grid AND brought back into what is open (a locked length never stays selected). */
export function openDuration(seconds: unknown, caps: VideoCapabilities): number {
  const snapped = snapVideoSeconds(seconds);
  if (!isLengthLocked(snapped, caps)) return snapped;
  return VIDEO_DURATION_STOPS[lastOpenStopIndex(caps)] ?? FILM_MAX_SEC;
}

// ── The render ────────────────────────────────────────────────────────────────────────────────────────────

/** 720p for a 4 / 6 s clip, 1080p from 8 s (Google: anything above 720p needs an 8 s clip) — what the film really renders at. */
export function videoResolution(seconds: number): VeoResolution {
  return resolutionFor(clipSecForSeconds(seconds));
}

/**
 * Seconds of title-card intro the music video's graphics pass puts at the start (musicVideoGraphics clamps it to `length − 6`,
 * so a short film is safe): 2 s for ONE clip, 10 s up to 48 s, 13 s from 48 s. These are the three values the panel always
 * used for 8 / 24 / 48 s, extended to every length without moving any of them.
 */
export function musicVideoIntroSec(seconds: number): number {
  if (seconds <= 8) return 2;
  return seconds < 48 ? 10 : 13;
}

/** True when the first-video trial slot can pay for this film: a slot is left AND the film is ONE short clip (≤ 8 s). */
export function freeSlotApplies(freeFilmsRemaining: number | null | undefined, seconds: number): boolean {
  return typeof freeFilmsRemaining === 'number' && freeFilmsRemaining > 0 && seconds <= TRIAL.freeFilmMaxSeconds;
}

// ── The prompt ────────────────────────────────────────────────────────────────────────────────────────────

/** "@image1", "@image2" … — how a reference photo is named inside the prompt. */
export const referenceToken = (index: number): string => `@image${index + 1}`;

/**
 * Put `token` into the prompt at the caret (or over the selection), with exactly one space around it: none doubled, none
 * missing. Returns the new text and where the caret goes (just after the token and its trailing space).
 */
export function insertPromptToken(value: string, selStart: number, selEnd: number, token: string): { value: string; caret: number } {
  const len = value.length;
  const a = Math.min(len, Math.max(0, Math.min(selStart, selEnd)));
  const b = Math.min(len, Math.max(0, Math.max(selStart, selEnd)));
  const before = value.slice(0, a);
  const after = value.slice(b);
  const lead = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const trail = after.length > 0 && /^\s/.test(after) ? '' : ' ';
  const inserted = `${lead}${token}${trail}`;
  return { value: `${before}${inserted}${after}`, caret: before.length + inserted.length };
}

// ── Extend (the request contract — the tab itself is locked until the pipeline exists) ───────────────────────

export type ExtendDirection = 'sequel' | 'prequel';

/**
 * ⚠️ WHAT IS REAL. Veo has no video-extension input in lib/veo (a clip takes a first frame, a first + last frame pair, or up
 * to three asset references — never a video), and the one honest way to continue a clip — its last frame as the next clip's
 * first frame, then a stitch — has no route yet that stitches an UPLOADED video with a new clip. So the Extend tab is
 * drawn complete and LOCKED, and this is the contract the route will take. A prequel is not possible at all: Veo has no
 * "last frame only" mode (capabilities.normalizeClipRequest drops a last frame that has no first frame).
 */
export const EXTEND_DIRECTIONS: readonly { id: ExtendDirection; supported: boolean }[] = Object.freeze([
  { id: 'sequel', supported: true },
  { id: 'prequel', supported: false },
]);

export const EXTEND_NEW_CLIP_SECS: readonly (4 | 6 | 8)[] = Object.freeze([4, 6, 8] as (4 | 6 | 8)[]);
export const EXTEND_PROMPT_MAX = 4000;
export const EXTEND_MAX_REFERENCE_IMAGES = 3;

export interface ExtendInput {
  direction: ExtendDirection;
  prompt: string;
  /** The uploaded clip, hosted (https) by our own upload route. */
  sourceVideoUrl: string | null;
  /** The NEW clip's length — one Veo clip: 4, 6 or 8 s. */
  seconds: number;
  quality: VideoQuality;
  referenceImageUrls?: readonly string[];
  soundtrackUrl?: string | null;
}

export interface ExtendRequest {
  direction: 'sequel';
  prompt: string;
  sourceVideoUrl: string;
  seconds: 4 | 6 | 8;
  quality: VideoQuality;
  referenceImageUrls: string[];
  soundtrackUrl: string | null;
}

export type ExtendReason = 'prompt_required' | 'prompt_too_long' | 'video_required' | 'direction_unsupported' | 'seconds_invalid' | 'too_many_references' | 'url_not_https';

export type ExtendVerdict = { ok: true; request: ExtendRequest } | { ok: false; reasons: ExtendReason[] };

const isHttps = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//i.test(u.trim());

/** Every reason the request is not sendable (all at once, so the form can say them together) or the request itself. Never throws. */
export function buildExtendRequest(input: ExtendInput): ExtendVerdict {
  const reasons: ExtendReason[] = [];
  const prompt = (input.prompt ?? '').trim();
  if (!prompt) reasons.push('prompt_required');
  else if (prompt.length > EXTEND_PROMPT_MAX) reasons.push('prompt_too_long');
  if (!input.sourceVideoUrl) reasons.push('video_required');
  else if (!isHttps(input.sourceVideoUrl)) reasons.push('url_not_https');
  if (input.direction !== 'sequel') reasons.push('direction_unsupported');
  const seconds = EXTEND_NEW_CLIP_SECS.find((s) => s === input.seconds);
  if (seconds === undefined) reasons.push('seconds_invalid');
  const refs = (input.referenceImageUrls ?? []).map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean);
  if (refs.length > EXTEND_MAX_REFERENCE_IMAGES) reasons.push('too_many_references');
  else if (refs.some((u) => !isHttps(u))) reasons.push('url_not_https');
  const soundtrack = input.soundtrackUrl ? input.soundtrackUrl.trim() : null;
  if (soundtrack && !isHttps(soundtrack)) reasons.push('url_not_https');
  if (reasons.length || seconds === undefined || !input.sourceVideoUrl) return { ok: false, reasons: Array.from(new Set(reasons)) };
  return {
    ok: true,
    request: {
      direction: 'sequel',
      prompt,
      sourceVideoUrl: input.sourceVideoUrl.trim(),
      seconds,
      quality: input.quality,
      referenceImageUrls: refs,
      soundtrackUrl: soundtrack,
    },
  };
}
