/**
 * lib/video/clipLastFrame.ts — Phase 7.5: Veo's FIRST → LAST frame, like Google AI Studio's "Frames to video" (GG 2026-11-13,
 * decision 1: "YES to the $0.60 paid check, after the DB is back and the core Runbook has run. Create a draft PR for the code
 * now"). Pure and client-safe. Ships OFF.
 *
 * With exactly two photos the clip today treats both as reference images (people and things to keep). With this on, the
 * user can instead say "photo 1 is the first frame, photo 2 the last": Veo interpolates between them (lib/veo/payload:
 * `lastFrame` requires `startImage`; every Veo 3.1 tier supports it, lib/veo/capabilities). Omni has no last frame.
 *
 * PRICE AND LENGTH UNCHANGED: two photos still render 8 s at today's two-photo price (directClipCredits, photos: 2) and Lite
 * stays off with two photos, so nothing in billing or in the request parser moves. Whether first→last should be priced like a
 * one-photo clip (and allow 4/6 s) is for GG after the paid check.
 *
 *   NEXT_PUBLIC_CLIP_LAST_FRAME — the panel offers the choice (inlined at build time).
 *   CLIP_LAST_FRAME             — the route reads `lastFrame: true` (server). Off, the field is ignored.
 */

const truthy = (v: string | undefined): boolean => {
  const s = (v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

export const clipLastFrameUiOn = (): boolean => truthy(process.env.NEXT_PUBLIC_CLIP_LAST_FRAME);
export const clipLastFrameServerOn = (): boolean => truthy(process.env.CLIP_LAST_FRAME);

/** The one shape first→last takes: exactly two photos. */
export const clipLastFrameFits = (photos: number): boolean => photos === 2;

export type ClipLastFrameParse = { ok: true; value: boolean } | { ok: false; field: 'lastFrame'; code: 'invalid' | 'needs_two_photos' };

/** The body's `lastFrame`: absent/false is off; true needs exactly two photos; anything else is invalid. */
export function parseClipLastFrame(body: unknown, photos: number): ClipLastFrameParse {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).lastFrame : undefined;
  if (raw === undefined || raw === null || raw === false) return { ok: true, value: false };
  if (raw !== true) return { ok: false, field: 'lastFrame', code: 'invalid' };
  if (!clipLastFrameFits(photos)) return { ok: false, field: 'lastFrame', code: 'needs_two_photos' };
  return { ok: true, value: true };
}
