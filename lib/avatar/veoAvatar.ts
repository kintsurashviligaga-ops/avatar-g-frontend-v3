/**
 * lib/avatar/veoAvatar.ts — the talking avatar on Google Veo (GG's choice, 2026-10-16 09:13Z card).
 *
 * The avatar used HeyGen, an engine outside Google, so the Google-only boundary paused it in Production. Google has no
 * "talking photo" engine; Veo does it from parts: the user's face photo is the clip's FIRST FRAME, Veo speaks the words
 * in its native audio (the film pipeline's own speech direction, which keeps a Georgian line verbatim and names the
 * language), and the user's "how it behaves" text directs the motion. One 8 s clip, priced as one Veo clip from the
 * video price SSoT (lib/credits/videoPricing) — no new price constant.
 *
 * ⚠️ A GEORGIAN LINE IS HEARD IN ELEVENLABS' VOICE, NOT VEO'S (GG's tap, 2026-10-17 07:54Z: „ElevenLabs ხმა"). Veo's own
 * Georgian is garbled (the 2026-10-16 film). Veo first rendered the person talking with NO sound and the line was laid
 * over it: the mouth moved on its own and did not match at all (GG, 10:15Z). Fitting the line onto the mouth Veo drew
 * for it (10:22Z) still flapped the jaw without the shapes of the sounds and slowed the voice (GG, 12:29Z), so the mouth
 * is now sync.so's: Veo SAYS the line in Latin letters, so the face moves like someone saying it, and on delivery
 * sync.so redraws the mouth to the cloned native-Georgian line at its natural speed and length (lib/avatar/voicedClip,
 * in app/api/genjutsu/status). English and Russian keep Veo's own voice.
 *
 * Pure: the route (app/api/avatar/veo) owns auth, money and the provider.
 */
import { buildSpeechDirection } from '@/lib/chat/filmPipeline';
import { videoCredits } from '@/lib/credits/videoPricing';
import { isGeorgianText } from '@/lib/audio/tts-model';
import { georgianToLatin } from './georgianLatin';
import type { VeoAspect } from '@/lib/veo/types';

/** Veo's longest clip; a start-image clip may be 4, 6 or 8 s. */
export const VEO_AVATAR_SECONDS = 8;
/** About what one person says in 8 s; the film pipeline caps a spoken line at the same size. */
export const VEO_AVATAR_SPEECH_MAX = 200;
export const VEO_AVATAR_DIRECTION_MAX = 300;

/**
 * What the avatar must not show or play. Nouns only (Veo's negative-prompt rule). Music under its words is what the
 * voice is told apart from (Production 2026-10-17 11:14Z: sound to 8 s read as speech), so it is asked away too.
 */
export const VEO_AVATAR_NEGATIVE = 'subtitles, captions, on-screen text, watermark, distorted face, extra people, face change, blurry, background music';

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
  /** The voice the user picked for a line ElevenLabs speaks; null = told by the words (lib/chat/filmVoiceover). */
  voiceGender: 'male' | 'female' | null;
}

/** Georgian words are voiced by ElevenLabs over a silent Veo clip; any other language is Veo's own voice. */
export function avatarVoiceByElevenLabs(speech: string): boolean {
  return isGeorgianText(speech);
}

/** The ElevenLabs line and the voiced clip of one avatar job, at fixed paths in `renders`: the job's uuid finds both again. */
export const avatarVoicePath = (uuid: string): string => `avatar-veo/${uuid}/voice.mp3`;
export const avatarVoicedPath = (uuid: string): string => `avatar-veo/${uuid}/voiced.mp4`;

export type VeoAvatarParse =
  | { ok: true; value: VeoAvatarInput & { photo: string; expectedCredits: number | null } }
  | { ok: false; field: 'photo' | 'speech' | 'direction' | 'aspect' | 'voiceGender' | 'expectedCredits'; code: 'required' | 'too_long' | 'invalid' };

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
  const vg = b.voiceGender === undefined || b.voiceGender === null || b.voiceGender === '' ? null : b.voiceGender;
  if (vg !== null && vg !== 'male' && vg !== 'female') return { ok: false, field: 'voiceGender', code: 'invalid' };
  const ec = b.expectedCredits;
  if (ec !== undefined && ec !== null && !(typeof ec === 'number' && Number.isInteger(ec) && ec >= 0)) return { ok: false, field: 'expectedCredits', code: 'invalid' };
  return { ok: true, value: { photo, speech, direction, aspect, voiceGender: vg, expectedCredits: typeof ec === 'number' ? ec : null } };
}

/**
 * The Veo prompt. A start-image clip is prompted for MOTION (Google's guidance): keep the person from the first frame,
 * act as directed, say the words — verbatim, in their own language.
 */
export function buildVeoAvatarPrompt({ speech, direction, voicedSec }: { speech: string; direction: string; voicedSec?: number }): string {
  const act = direction ? ` ${direction.replace(/[.!?…]?$/, '.')}` : ' Natural, warm expression and small natural head movements.';
  return [
    'The person in the first frame looks into the camera and talks to the viewer. Keep their face, hair, clothes and the background exactly as in the first frame; a steady medium close-up.',
    act.trim(),
    // A line voiced by ElevenLabs: Veo says the same syllables in Latin letters, at the ElevenLabs line's length, so the
    // face moves like someone saying them; sync.so then redraws the mouth to the line (lib/avatar/voicedClip).
    voicedSec !== undefined ? dubbedLineDirection(speech, voicedSec) : buildSpeechDirection(speech),
  ].join(' ');
}

function dubbedLineDirection(speech: string, seconds: number): string {
  const talk = Math.max(1, Math.min(VEO_AVATAR_SECONDS, Math.round(seconds * 2) / 2));
  const words = georgianToLatin(speech).replace(/"/g, '');
  const pace = talk >= VEO_AVATAR_SECONDS - 0.5
    ? 'Calm, natural pace that fills the whole clip, every word complete.'
    : `Calm, natural pace, starting right away and taking about ${talk} seconds; then they close their mouth and hold a warm, friendly look at the camera.`;
  return [
    `They speak aloud to the camera, lips moving in sync with the words, a Georgian phrase pronounced exactly as written, every vowel clear: "${words}".`,
    pace,
    'Only their voice is heard, clear and close, with no music.',
  ].join(' ');
}
