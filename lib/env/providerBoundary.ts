/**
 * lib/env/providerBoundary.ts — the one rule for re-opening engines outside Google + ElevenLabs (final P0/P1 repair run).
 *
 * MEDIA_GOOGLE_ONLY, VIDEO_GOOGLE_ONLY and AI_GOOGLE_ONLY are fail-closed (default ON). Each used to re-open its legacy
 * third-party engines (HeyGen, Kling, Replicate, Runway, Higgsfield, Udio, Anthropic, DeepSeek…) on a single falsy env
 * value — one stray `=0` copied between Vercel targets silently sent paid jobs outside the approved provider boundary.
 *
 * A falsy switch now counts only together with OUTSIDE_ENGINES_APPROVED: a non-empty owner approval reference (e.g.
 * `owner-2026-10-20-heygen`, ≥ 8 chars of [A-Za-z0-9._:-]) that whoever flips the switch must name. A falsy switch
 * without it is IGNORED — the boundary stays closed. Rollback is unchanged in shape: set the switch falsy AND the
 * approval; unset either to close again.
 *
 * MASTER TASK v3.1 retires the rule switch by switch. AI_GOOGLE_ONLY no longer reads it: chat, voice and agents are
 * Google-only whatever either variable says (lib/ai/google/policy). VIDEO_GOOGLE_ONLY and MEDIA_GOOGLE_ONLY follow.
 */
import { isEnabledByDefault } from './flag';

const APPROVAL_SHAPE = /^[A-Za-z0-9._:-]{8,120}$/;

/** Is there an owner approval on record for running outside engines? */
export function outsideEnginesApproved(env: NodeJS.ProcessEnv = process.env): boolean {
  return APPROVAL_SHAPE.test((env.OUTSIDE_ENGINES_APPROVED ?? '').trim());
}

/** Google-only unless the switch is explicitly falsy AND the owner approval is on record. */
export function googleOnlySwitch(value: string | undefined | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (isEnabledByDefault(value)) return true;
  return !outsideEnginesApproved(env);
}
