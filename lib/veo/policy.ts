/**
 * lib/veo/policy.ts — the Google-only switch for the video pipeline (docs/VEO_ENGINE.md §3).
 *
 * Its own tiny module on purpose: the text agents (director, translation) and the render path all read it, and
 * none of them should pull the Vertex/GCS client stack in just to ask one yes/no question.
 *
 * Always ON (MASTER TASK v3.1, audit F-04): a Veo miss is a Veo failure — surfaced honestly and refunded by the
 * existing per-leg rollback — never a silent Runway/Kling/LTX clip; the director and the English translation run on
 * Gemini. VIDEO_GOOGLE_ONLY is no longer read: no value, with or without OUTSIDE_ENGINES_APPROVED, restores the old
 * multi-vendor fallbacks.
 */

/** Always true: video runs on Veo and Gemini only. Kept as a function so its callers read the same. */
export function isGoogleOnly(): boolean {
  return true;
}
