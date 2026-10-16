/**
 * lib/avatar/veoAvatar.ts — the talking avatar on Google Veo (GG's choice, 2026-10-16 09:13Z card).
 *
 * The avatar used HeyGen, an engine outside Google, so the Google-only boundary paused it in Production. Google has no
 * "talking photo" engine; Veo does it from parts: the user's face photo is the clip's FIRST FRAME, Veo speaks the words
 * in its native audio (the film pipeline's own speech direction, which keeps a Georgian line verbatim and names the
 * language), and the user's "how it behaves" text directs the motion. One 8 s clip, priced as one Veo clip from the
 * video price SSoT (lib/credits/videoPricing) — no new price constant.
 *
 * Pure: the route (app/api/avatar/veo) owns auth, money and the provider.
 */
import { buildSpeechDirection } from '@/lib/chat/filmPipeline';
import { videoCredits } from '@/lib/credits/videoPricing';
import type { VeoAspect } from '@/lib/veo/types';

/** Veo's longest clip; a start-image clip may be 4, 6 or 8 s. */
export const VEO_AVATAR_SECONDS = 8;
/** About what one person says in 8 s; the film pipeline caps a spoken line at the same size. */
export const VEO_AVATAR_SPEECH_MAX = 200;
export const VEO_AVATAR_DIRECTION_MAX = 300;

/** What the avatar must not show. Nouns only (Veo's negative-prompt rule). */
export const VEO_AVATAR_NEGATIVE = 'subtitles, captions, on-screen text, watermark, distorted face, extra people, face change, blurry';

/** Open to everyone only by the owner's flag (AVATAR_VEO_PUBLIC=1, a public flag: GG's word); otherwise admins only. */
export function veoAvatarPublic(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AVATAR_VEO_PUBLIC === '1';
}

/** Credits for one avatar clip: the same as one Veo Fast clip of that length. */
export function veoAvatarCredits(): number {
  return videoCredits({ seconds: VEO_AVATAR_SECONDS, quality: 'fast' });
}

export interface VeoAvatarInput {
  speech: string;
  direction: string;
  aspect: VeoAspect;
}

export type VeoAvatarParse =
  | { ok: true; value: VeoAvatarInput & { photo: string; expectedCredits: number | null } }
  | { ok: false; field: 'photo' | 'speech' | 'direction' | 'aspect' | 'expectedCredits'; code: 'required' | 'too_long' | 'invalid' };

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** The request the browser sends. Strict: a line too long for 8 s is refused, never cut mid-sentence. */
export function parseVeoAvatarRequest(raw: unknown): VeoAvatarParse {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const photo = clean(b.photo);
  if (!photo) return { ok: false, field: 'photo', code: 'required' };
  const speech = clean(b.speech);
  if (!speech) return { ok: false, field: 'speech', code: 'required' };
  if (speech.length > VEO_AVATAR_SPEECH_MAX) return { ok: false, field: 'speech', code: 'too_long' };
  const direction = clean(b.direction);
  if (direction.length > VEO_AVATAR_DIRECTION_MAX) return { ok: false, field: 'direction', code: 'too_long' };
  const aspect = b.aspect === undefined || b.aspect === null || b.aspect === '' ? '9:16' : b.aspect;
  if (aspect !== '9:16' && aspect !== '16:9') return { ok: false, field: 'aspect', code: 'invalid' };
  const ec = b.expectedCredits;
  if (ec !== undefined && ec !== null && !(typeof ec === 'number' && Number.isInteger(ec) && ec >= 0)) return { ok: false, field: 'expectedCredits', code: 'invalid' };
  return { ok: true, value: { photo, speech, direction, aspect, expectedCredits: typeof ec === 'number' ? ec : null } };
}

/**
 * The Veo prompt. A start-image clip is prompted for MOTION (Google's guidance): keep the person from the first frame,
 * act as directed, say the words — verbatim, in their own language.
 */
export function buildVeoAvatarPrompt({ speech, direction }: { speech: string; direction: string }): string {
  const act = direction ? ` ${direction.replace(/[.!?…]?$/, '.')}` : ' Natural, warm expression and small natural head movements.';
  return [
    'The person in the first frame looks into the camera and talks to the viewer. Keep their face, hair, clothes and the background exactly as in the first frame; a steady medium close-up.',
    act.trim(),
    buildSpeechDirection(speech),
  ].join(' ');
}
