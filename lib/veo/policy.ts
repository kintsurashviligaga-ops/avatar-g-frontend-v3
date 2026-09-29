/**
 * lib/veo/policy.ts — the Google-only switch for the video pipeline (docs/VEO_ENGINE.md §3).
 *
 * Its own tiny module on purpose: the text agents (director, translation) and the render path all read it, and
 * none of them should pull the Vertex/GCS client stack in just to ask one yes/no question.
 *
 * ON by default (VIDEO_GOOGLE_ONLY unset): a Veo miss is a Veo failure — surfaced honestly and refunded by the
 * existing per-leg rollback — never a silent Runway/Kling/LTX clip; the director and the English translation run
 * on Gemini. `VIDEO_GOOGLE_ONLY=0` (or false/no/off) restores the old multi-vendor fallbacks — the kill switch
 * for when the Google project cannot serve (e.g. its prepaid credits are depleted: every call answers 402).
 */
import { isEnabledByDefault } from '@/lib/env/flag';

export function isGoogleOnly(): boolean {
  return isEnabledByDefault(process.env.VIDEO_GOOGLE_ONLY);
}
