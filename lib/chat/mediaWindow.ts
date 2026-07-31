/**
 * Decide which turns still carry their attachments when a chat history is sent to the model.
 *
 * ⚠️ EVERY TURN RE-UPLOADED EVERY IMAGE EVER ATTACHED. The payload builder mapped the FULL history and
 * emitted each turn's `medias` as base64 data URLs, with no windowing anywhere. So a photo attached five
 * messages ago was re-serialised, re-uploaded over the wire and re-parsed server-side on every
 * subsequent text-only message — and then re-ingested by Gemini as inline_data all over again.
 *
 * The route's own cap shows the scale it was built to survive: `MAX_BODY_BYTES = 16_000_000`. On a phone
 * uplink a multi-megabyte body is seconds of upload before the server has begun any work, and it grows
 * with every image the conversation has ever seen. It is the largest remaining source of "the chat feels
 * slow" on a long thread, and unlike the server-side round-trips it gets worse the more you use it.
 *
 * ⚠️ WHY A WINDOW AND NOT A ONE-SHOT STRIP. Dropping every older attachment outright would break the
 * ordinary follow-up — "make it warmer", "what's written on the sign?" — which refers to an image from
 * one or two turns back and needs the model to still see it. Keeping the most recent N turns' media
 * preserves every realistic reference while cutting the unbounded tail.
 *
 * Older turns keep their TEXT and get a short placeholder in place of each dropped attachment, so the
 * model is told an image existed rather than silently seeing a gap — a conversation that reads as though
 * the user never attached anything invites the model to contradict them.
 */

export interface MediaLike { dataUrl: string; mimeType: string }
export interface TurnLike { role: string; text?: string; medias?: MediaLike[] }

/**
 * How many of the most recent turns keep their real attachments.
 *
 * 2 covers "here is a photo" → assistant reply → "now make it warmer": the image is still attached to a
 * turn inside the window when the follow-up is sent.
 */
export const MEDIA_WINDOW_TURNS = 2;

/**
 * Indices of the turns that should send their media as real bytes.
 *
 * Counts from the END and only counts turns that ACTUALLY carry media — otherwise a run of text-only
 * messages would push the last image out of the window while the user is still talking about it.
 */
export function mediaCarryingIndices(history: ReadonlyArray<TurnLike>, keep = MEDIA_WINDOW_TURNS): Set<number> {
  const out = new Set<number>();
  if (!Array.isArray(history) || keep <= 0) return out;
  for (let i = history.length - 1; i >= 0 && out.size < keep; i--) {
    const m = history[i]?.medias;
    if (m && m.length) out.add(i);
  }
  return out;
}

/** A short, honest stand-in for an attachment that is no longer being re-sent. */
export function mediaPlaceholder(mimeType: string): string {
  const kind = /^image\//i.test(mimeType) ? 'image'
    : /^video\//i.test(mimeType) ? 'video'
      : /^audio\//i.test(mimeType) ? 'audio'
        : 'file';
  return `[earlier ${kind} attachment]`;
}

/**
 * True when this turn should send its attachments as bytes.
 *
 * Split out from the payload builder so the windowing rule is testable without constructing data URLs.
 */
export function shouldSendMedia(index: number, carrying: ReadonlySet<number>): boolean {
  return carrying.has(index);
}
