/**
 * lib/audio/georgian-voice.ts
 * ===========================
 * SINGLE SOURCE OF TRUTH for the native Georgian voices used across the pipeline.
 *
 * These are real Georgian speakers cloned via ElevenLabs Instant Voice Cloning
 * (founder-supplied recordings), read on `eleven_v3` (the only ElevenLabs model
 * that supports `ka`). Every Georgian synthesis path — film voiceover, the /voice
 * pipeline, lip-sync dub, read-aloud, the realtime voice agent — resolves its
 * Georgian voice through here, so swapping a voice is a one-line change.
 *
 * An env override (ELEVENLABS_GEORGIAN_VOICE_ID) still wins when set.
 */
export const KA_VOICE_FEMALE = '9jZPhI8VfIo3Mx8pl6OF';
export const KA_VOICE_MALE = 'hYqARi31q6JpW0IjtFUt';

export type KaGender = 'male' | 'female';

/** Resolve the ElevenLabs voice id for Georgian: env override → cloned by gender. */
export function georgianVoiceId(gender: KaGender = 'female'): string {
  const env = (process.env.ELEVENLABS_GEORGIAN_VOICE_ID || '').trim();
  return env || (gender === 'male' ? KA_VOICE_MALE : KA_VOICE_FEMALE);
}
