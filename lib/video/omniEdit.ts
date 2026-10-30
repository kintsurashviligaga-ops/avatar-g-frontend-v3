/**
 * lib/video/omniEdit.ts — a video the user uploaded, edited or extended by Gemini Omni Flash on Vertex (GG, 2026-10-25
 * 16:58Z; card 17:04Z „კი, ორივე"). Pure and client-safe: the chat's card and POST /api/video/omni-edit read these.
 *
 *   · EDIT changes the video the words describe („make it night", „put a hat on him") and renders the video's own length;
 *     EXTEND keeps the video and adds 4, 6, 8 or 10 s after it (8 by default), and the result is the two together.
 *   · Omni takes a video of at most 10 s (Google's limit), so a longer upload is refused before anything is charged.
 *   · the words go as typed; the engine's sound follows them, as for the 10 s clip (lib/video/omniClip).
 *   · the frame is the video's own: Omni refuses an aspect ratio for an edit (the 2026-10-25 probe), and an extend
 *     continues the same picture.
 *
 * ⚠️ THE PRICE IS THE SECONDS OMNI RENDERS. An edit renders the video's length, billed on the 4 · 6 · 8 · 10 s grid
 * rounded up (a 5 s video bills as 6); an extend bills only the new seconds (the probe: the 3 s input was not billed
 * again). Both carry the input video's own tokens, which is why the price book's omniEdit row is not the clip's
 * per-second share (lib/credits/priceBook, set on GG's card).
 */
import { omniEditCredits as bookCredits, type OmniEditSeconds } from '@/lib/credits/priceBook';
import { OMNI_DEFAULT_RESOLUTION, type DirectClipResolution } from './directClip';

export type OmniEditOp = 'edit' | 'extend';
export type { OmniEditSeconds };

export const OMNI_EDIT_SECONDS: readonly OmniEditSeconds[] = [4, 6, 8, 10];
export const OMNI_EXTEND_DEFAULT_SECONDS: OmniEditSeconds = 8;
/** Google's limit on the video Omni takes; a phone's 10.03 s recording is still a 10 s video. */
export const OMNI_EDIT_INPUT_MAX_SEC = 10;
export const OMNI_EDIT_INPUT_SLACK_SEC = 0.25;
/** Omni renders at least 3 s, so an edit needs a video that long; an extend can start from any moment of video. */
export const OMNI_EDIT_MIN_INPUT_SEC = 3;
export const OMNI_EXTEND_MIN_INPUT_SEC = 1;
export const OMNI_EDIT_PROMPT_MAX = 2_000;

/** Is a video of `inputSec` one Omni can take for `op`? */
export function omniEditInputCheck(op: OmniEditOp, inputSec: number | null | undefined): 'ok' | 'too_long' | 'too_short' | 'unknown' {
  if (typeof inputSec !== 'number' || !Number.isFinite(inputSec) || inputSec <= 0) return 'unknown';
  if (inputSec > OMNI_EDIT_INPUT_MAX_SEC + OMNI_EDIT_INPUT_SLACK_SEC) return 'too_long';
  if (inputSec < (op === 'edit' ? OMNI_EDIT_MIN_INPUT_SEC : OMNI_EXTEND_MIN_INPUT_SEC) - 0.05) return 'too_short';
  return 'ok';
}

/** A length the user picked for an extend → the grid's; anything else → 8 s. */
export function snapOmniExtendSeconds(value: unknown): OmniEditSeconds {
  const n = typeof value === 'number' ? value : Number(value);
  return (OMNI_EDIT_SECONDS as readonly number[]).includes(n) ? (n as OmniEditSeconds) : OMNI_EXTEND_DEFAULT_SECONDS;
}

/** The seconds the price is for: an edit, the video's length rounded up to the grid; an extend, the new seconds. */
export function omniEditBilledSeconds(op: OmniEditOp, inputSec: number, seconds?: unknown): OmniEditSeconds {
  if (op === 'extend') return snapOmniExtendSeconds(seconds);
  const s = Math.max(0, inputSec);
  return s <= 4 + 0.05 ? 4 : s <= 6 + 0.05 ? 6 : s <= 8 + 0.05 ? 8 : 10;
}

/** The `duration` Omni is asked for: an edit, the video's own length (3–10 s); an extend, the new seconds. */
export function omniEditRequestSeconds(op: OmniEditOp, inputSec: number, seconds?: unknown): number {
  if (op === 'extend') return snapOmniExtendSeconds(seconds);
  return Math.min(OMNI_EDIT_INPUT_MAX_SEC, Math.max(OMNI_EDIT_MIN_INPUT_SEC, Math.round(inputSec)));
}

/** The credits for an edit or extend: the price book's omniEdit row for the billed seconds and resolution. */
export function omniEditCredits(input: { op: OmniEditOp; inputSec: number; seconds?: unknown; resolution?: DirectClipResolution | null }): number {
  return bookCredits(omniEditBilledSeconds(input.op, input.inputSec, input.seconds), input.resolution === '1080p' ? '1080p' : '720p');
}

/** How long the result is: an edit, the video's own length; an extend, the video and the new seconds. */
export function omniEditOutputSeconds(op: OmniEditOp, inputSec: number, seconds?: unknown): number {
  const input = Math.round(Math.max(0, inputSec) * 10) / 10;
  return op === 'extend' ? Math.round((input + snapOmniExtendSeconds(seconds)) * 10) / 10 : omniEditRequestSeconds('edit', inputSec);
}

/** Words that ask for what happens next („გააგრძელე", „continue", „продолжи") make an extend; anything else is an edit. */
const CONTINUE = /გააგრძელ|გაგრძელ|შემდეგ\s+რა\s+(?:მოხდ|ხდებ)|\b(?:continue|continuation|extend|extension|longer|keep\s+going|carry\s+on|what\s+happens\s+next)\b|продолж|продли|удлин/iu;

export function omniEditOpFromWords(text: string): OmniEditOp {
  return CONTINUE.test(text) ? 'extend' : 'edit';
}

// ─── The request the chat sends ──────────────────────────────────────────────────────────────────────────────────

// ─── A clip made here, continued by Omni itself ──────────────────────────────────────────────────────────────────

/**
 * ⚠️ GG 2026-10-26 15:41Z „მეორე ვიდეო არ გააკეთა": twice an uploaded speaking clip, extended +8 s at 1080p, came back from
 * Vertex with no video (both refunded). Google's Omni page: „you cannot extend an uploaded video where someone is talking to
 * add additional dialogue"; speech IS supported when a video Omni made is continued by its `previous_interaction_id`. So a
 * clip made in this chat is continued that way: its signed job id (lib/genjutsu/chargeToken composeOmniJobId) names the
 * interaction, and nothing is uploaded.
 *
 * A clip (`::o4` … `::o10`) or an edit (`::oe6`, its length on the grid) only, so the source is never over Google's 10 s and
 * the input tokens stay those the price book's omniEdit row was set for. An extend's result (`::ox8`) is longer than any
 * price on that row assumed, so it is not continued again.
 */
const OMNI_SOURCE_TAIL = /::o(?:(4|6|8|10)|e(4|6|8|10))(?=~|$)/;

/** The length of the clip a job id names, or null when it is not one Omni can continue (pure; the server verifies the id). */
export function omniSourceOfJob(jobId: string): { seconds: OmniEditSeconds } | null {
  if (typeof jobId !== 'string' || !jobId || jobId.length > 4_000) return null;
  const m = OMNI_SOURCE_TAIL.exec(jobId);
  return m ? { seconds: Number(m[1] ?? m[2]) as OmniEditSeconds } : null;
}

export interface OmniEditRequest {
  op: OmniEditOp;
  prompt: string;
  /** The uploaded video: its stored path (the chat's upload), resolved for this caller only (lib/security/callerMedia). */
  video: string | null;
  /** Or a clip made in this chat: its signed job id, continued by Omni's own interaction (omniSourceOfJob). */
  from: string | null;
  /** An extend's new seconds; an edit's are the video's own, measured by the server. */
  seconds: OmniEditSeconds;
  resolution: DirectClipResolution;
  /** The price the card showed; a different server price is refused before any charge (409 price_changed). */
  expectedCredits: number | null;
}

export type OmniEditParse =
  | { ok: true; value: OmniEditRequest }
  | { ok: false; field: 'op' | 'prompt' | 'video' | 'from' | 'seconds' | 'resolution' | 'expectedCredits'; code: 'required' | 'too_long' | 'invalid' };

/** The body POST /api/video/omni-edit accepts. Strict and free: a bad field is refused before the rate limit and the charge. */
export function parseOmniEditRequest(raw: unknown): OmniEditParse {
  const b = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const op = b.op;
  if (op !== 'edit' && op !== 'extend') return { ok: false, field: 'op', code: 'invalid' };

  const prompt = typeof b.prompt === 'string' ? b.prompt.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : '';
  if (!prompt) return { ok: false, field: 'prompt', code: 'required' };
  if (prompt.length > OMNI_EDIT_PROMPT_MAX) return { ok: false, field: 'prompt', code: 'too_long' };

  // One source: the upload, or a clip made here (never both).
  const from = typeof b.from === 'string' ? b.from.trim() : '';
  if (from && !omniSourceOfJob(from)) return { ok: false, field: 'from', code: 'invalid' };
  const video = typeof b.video === 'string' ? b.video.trim() : '';
  if (!video && !from) return { ok: false, field: 'video', code: 'required' };
  if (video.length > 4_000 || (video && from)) return { ok: false, field: 'video', code: 'invalid' };

  const rawSec = b.seconds === undefined || b.seconds === null ? OMNI_EXTEND_DEFAULT_SECONDS : b.seconds;
  if (!(OMNI_EDIT_SECONDS as readonly unknown[]).includes(rawSec)) return { ok: false, field: 'seconds', code: 'invalid' };

  const resolution = b.resolution === undefined || b.resolution === null || b.resolution === '' ? OMNI_DEFAULT_RESOLUTION : b.resolution;
  if (resolution !== '720p' && resolution !== '1080p') return { ok: false, field: 'resolution', code: 'invalid' };

  const ec = b.expectedCredits;
  if (ec !== undefined && ec !== null && !(typeof ec === 'number' && Number.isInteger(ec) && ec >= 0)) return { ok: false, field: 'expectedCredits', code: 'invalid' };

  return {
    ok: true,
    value: { op, prompt, video: video || null, from: from || null, seconds: rawSec as OmniEditSeconds, resolution, expectedCredits: typeof ec === 'number' ? ec : null },
  };
}
