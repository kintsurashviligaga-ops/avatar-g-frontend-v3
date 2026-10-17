/**
 * lib/chat/filmSceneRedo.ts — ONE scene of a finished chat film, rendered again and cut back into the same film
 * (the owner's audit 2026-10-17, item 3; price: the owner's tap 14:26:55Z, "სცენის ფასი").
 *
 * WHY. A film is four to eight Veo scenes. When one of them comes out wrong (a hand melts, the product is off, a scene
 * Google declined left the cut short), the only way out was a whole new film at the whole film's price. The old
 * /api/pipeline/remix re-planned the film from its brief instead of using the scene that was rendered, so the new clip
 * started from no storyboard frame, waited at most 150 s for a Veo clip that takes one to three minutes, and re-stitched
 * the film WITHOUT its music and narration.
 *
 * HOW. The film start keeps a scene book on the server (./filmSceneBook): every scene's own clip request, its storyboard
 * frame, and what the scene costs. Every delivered stitch of the film keeps what it was cut from. A redo then:
 *   1. charges the scene's price, once (8 s on Fast = 25 credits; an admin pays nothing);
 *   2. renders that scene again from its own storyboard frame, with the user's note folded into its prompt and a new seed;
 *   3. gives the price back when Google's own verdict says the render failed, or when it never comes back;
 *   4. cuts the new clip into the film's last stitch in place of the old one (or into the gap a failed scene left), with
 *      the same music, narration and choices, as a stitch its caller has already paid for.
 * The film's own Library row (id = its token) then holds the new cut.
 *
 * This file is the pure part: the rules, testable without Redis, Veo or ffmpeg.
 */

/** One scene as the start built it, minus nothing: what a redo sends again. */
export interface FilmBookScene {
  ordinal: number;
  seed: number;
  userPrompt: string;
  selectedOptions: Record<string, string>;
  /** The scene's storyboard frame (the one the user approved), its redo's start. */
  storyboardFrame: string | null;
}

export interface FilmSceneBook {
  v: 1;
  tokenId: string;
  /** The film's owner. Nobody else can redo, poll or stitch its scenes. */
  uid: string;
  sessionId: string;
  locale: string;
  compositeId: string;
  videoModel: string | null;
  forecast: { wholesaleGel: number; retailGel: number };
  /** What one scene costs at the film's tier, length and mode (lib/credits/videoPricing videoCredits). */
  scenePrice: number;
  /** Every scene of the film, in order. */
  scenes: FilmBookScene[];
  createdAt: number;
}

/** A segment of a delivered stitch. `ordinal` is the scene it is (absent on a stitch from before ordinals were sent). */
export interface StitchSegment {
  url: string;
  durationSec?: number;
  ordinal?: number;
}

/** What a delivered stitch of the film was cut from: kept so a redo can cut the film again the same way. */
export interface FilmStitchRecord {
  v: 1;
  tokenId: string;
  uid: string;
  segments: StitchSegment[];
  /** The rest of the stitch body as the route read it (music, narration, transitions, format, final length …). */
  body: Record<string, unknown>;
  /** The music the stitch actually used (an uploaded track, or the score it composed): reused, never composed again. */
  musicUrl: string | null;
  at: number;
}

export type RedoStatus = 'rendering' | 'ready' | 'stitching' | 'done' | 'failed';

/** One redo of one scene. Written by the server only, read back by the scene's owner. */
export interface FilmRedoJob {
  v: 1;
  tokenId: string;
  uid: string;
  ordinal: number;
  attempt: number;
  /** The ledger ref the price was taken under (`filmredo:<token>:<ordinal>:<attempt>`); its refund is paid by it. */
  ref: string;
  /** What was taken: the scene's price, or 0 for an admin. */
  credits: number;
  status: RedoStatus;
  taskRef: string | null;
  sessionId: string;
  clipUrl: string | null;
  masterUrl: string | null;
  /** Credits given back (Google failed the render, or it never came back). */
  refunded: boolean;
  error: string | null;
  startedAt: number;
  updatedAt: number;
}

/** A render with no answer after this long is given up on, and its price goes back. */
export const REDO_RENDER_DEADLINE_MS = 25 * 60_000;
/** The scene book, every stitch record and every redo live this long: a film can be corrected the day it was made. */
export const FILM_BOOK_TTL_SEC = 24 * 3600;
/** The longest note a user can add to a redo (it is folded into a Veo prompt). */
export const REDO_NOTE_MAX = 600;

/** The ledger ref of a redo's price. One per attempt, so every attempt is charged once and refunded at most once. */
export function redoChargeRef(tokenId: string, ordinal: number, attempt: number): string {
  return `filmredo:${tokenId}:${ordinal}:${attempt}`;
}

/**
 * A new seed for each attempt. The same seed, prompt and frame would ask Veo for the same clip again, the one the user
 * is replacing. Deterministic per attempt, inside Veo's 32-bit seed range.
 */
export function redoSeed(seed: number, attempt: number): number {
  const base = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return (base + attempt * 7_919 + 1) % 4_294_967_295;
}

/** The user's note, cleaned for a prompt: one line, no control characters, bounded. Empty → null. */
export function cleanRedoNote(note: unknown): string | null {
  if (typeof note !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = note.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, REDO_NOTE_MAX);
  return s || null;
}

/**
 * The clip request a redo sends: the scene's own, starting from its storyboard frame (the frame the user approved; the
 * start's end-frame request is dropped, as on every chained scene), with the note (already in English) folded in.
 */
export function redoClipRequest(scene: FilmBookScene, noteEn: string | null): { userPrompt: string; selectedOptions: Record<string, string> } {
  const { veoEndFrame: _end, ...options } = scene.selectedOptions;
  const selectedOptions = scene.storyboardFrame ? { ...options, characterReference: scene.storyboardFrame } : options;
  const userPrompt = noteEn ? `${scene.userPrompt} EDIT FOR THIS SCENE: ${noteEn}.` : scene.userPrompt;
  return { userPrompt, selectedOptions };
}

/**
 * The film's segments with `ordinal`'s clip replaced by `clipUrl`, or put into the gap a failed scene left, in scene
 * order. null when the stitch cannot say which segment is which scene (a stitch from before ordinals were sent).
 */
export function restitchSegments(
  segments: readonly StitchSegment[],
  ordinal: number,
  clipUrl: string,
  sceneSec: number,
): { segments: StitchSegment[]; inserted: boolean } | null {
  if (segments.length === 0 || segments.some((s) => typeof s.ordinal !== 'number')) return null;
  const at = segments.findIndex((s) => s.ordinal === ordinal);
  if (at >= 0) {
    const out = segments.map((s) => ({ ...s }));
    out[at] = { ...out[at]!, url: clipUrl };
    return { segments: out, inserted: false };
  }
  const out = [...segments.map((s) => ({ ...s })), { url: clipUrl, durationSec: sceneSec, ordinal }];
  out.sort((a, b) => (a.ordinal as number) - (b.ordinal as number));
  return { segments: out, inserted: true };
}

/**
 * The stitch body that cuts the film again: the last stitch's choices with the new segments, the same music (never
 * composed again), the film's brief and the film's token. A film that gained a scene drops its final-length contract,
 * which was cut for the scenes it had.
 *
 * ⚠️ THE BRIEF STAYS WITH THE MUSIC. The assembler reads `scorePrompt` for far more than a score: the colour grade (a
 * night brief → the night LUT), music-video mode and its lower-third, a commercial's overlay, and the Library row's
 * prompt. It was dropped whenever the music was kept, so the redone film re-graded the scenes the user kept (live E2E
 * 2026-10-17: "ღამის თბილისი" came back in the default teal-orange instead of the night grade). A recorded `musicUrl`
 * wins over composing in the assembler, so the brief never scores the film again.
 */
export function restitchBody(record: FilmStitchRecord, segments: StitchSegment[], inserted: boolean): Record<string, unknown> {
  const { scorePrompt: _score, finalDurationSec, segments: _old, filmTokenId: _t, musicUrl: _m, ...rest } = record.body;
  return {
    ...rest,
    segments,
    filmTokenId: record.tokenId,
    ...(typeof _score === 'string' && _score ? { scorePrompt: _score } : {}),
    ...(record.musicUrl ? { musicUrl: record.musicUrl } : {}),
    ...(!inserted && typeof finalDurationSec === 'number' ? { finalDurationSec } : {}),
  };
}

/** The keys of a stitch body that name a sound the assembler fetches (with the segments and stems: all its own-media check reads). */
const LINK_KEYS = ['customAudioUrl', 'musicUrl', 'voiceoverUrl', 'sfxUrl'] as const;

/**
 * The stitch body with every media link in it renewed by `renew` (a link it cannot renew is handed over as it was).
 *
 * ⚠️ A FILM'S NARRATION IS STORED BEHIND A 2-HOUR LINK (lib/chat/filmVoiceover), and the assembler refuses a link of ours
 * that has expired unless a Library row holds that object (lib/security/callerMedia). So a redo cut more than two hours
 * after the film was refused with media_not_yours and could never succeed (live E2E 2026-10-17: film B, cut at 17:49Z,
 * redone at 19:48Z). These links come from the film's own delivered stitch, kept by the server for its owner, and each
 * passed that same check when the film was cut.
 */
export async function withRenewedLinks(
  body: Record<string, unknown>,
  renew: (url: string) => Promise<string>,
): Promise<Record<string, unknown>> {
  const one = async (v: unknown): Promise<unknown> => {
    if (typeof v !== 'string' || !v) return v;
    return (await renew(v).catch(() => v)) || v;
  };
  const urls = async (list: unknown): Promise<unknown> => (Array.isArray(list)
    ? Promise.all(list.map(async (s: unknown) => (s && typeof s === 'object' && 'url' in s
      ? { ...(s as Record<string, unknown>), url: await one((s as { url: unknown }).url) }
      : s)))
    : list);
  const out: Record<string, unknown> = { ...body };
  for (const k of LINK_KEYS) if (out[k] !== undefined) out[k] = await one(out[k]);
  if (out.segments !== undefined) out.segments = await urls(out.segments);
  if (out.dialogueStems !== undefined) out.dialogueStems = await urls(out.dialogueStems);
  return out;
}

/** The keys of a stitch body that are kept for a redo; everything else (and anything unknown) is left out. */
const KEPT_BODY_KEYS = [
  'voiceoverUrl', 'dialogueStems', 'musicUrl', 'noMusic', 'sfxUrl', 'globalRender', 'orientation', 'scorePrompt',
  'musicVideoMode', 'customAudioUrl', 'captionLang', 'vocalGender', 'captionAlignment', 'subtitles', 'finalDurationSec',
  'marketing',
] as const;
/** A kept body larger than this drops its caption timings (re-derived from the film's own words when subtitles are on). */
const MAX_KEPT_BODY_BYTES = 400_000;

/** What a delivered stitch keeps of its body for a redo. Subtitles are re-read from the film's words, not stored twice. */
export function keptStitchBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of KEPT_BODY_KEYS) if (body[k] !== undefined && body[k] !== null) out[k] = body[k];
  if (out.subtitles === true) delete out.captionAlignment;
  if (JSON.stringify(out).length > MAX_KEPT_BODY_BYTES) delete out.captionAlignment;
  return out;
}

/** What the scene's owner is shown of a redo (never its task ref or ledger ref). */
export function publicRedo(job: FilmRedoJob): {
  ordinal: number; attempt: number; status: RedoStatus; credits: number; refunded: boolean;
  clipUrl: string | null; masterUrl: string | null; error: string | null;
} {
  return {
    ordinal: job.ordinal,
    attempt: job.attempt,
    status: job.status,
    credits: job.credits,
    refunded: job.refunded,
    clipUrl: job.clipUrl,
    masterUrl: job.masterUrl,
    error: job.error,
  };
}
