/**
 * lib/chat/voiceMap.ts
 * ====================
 * PHASE 2 L1 — Character Voice selector → ElevenLabs voice-id resolution.
 *
 * The video panel's Character Voice sub-panel chooses a (language, persona, tone).
 * This module maps that selection to a concrete ElevenLabs voice id, additively
 * layered over the existing gender path (filmVoiceover.pickNarratorVoiceId →
 * ELEVENLABS_VOICE_ID_MALE/_FEMALE). Resolution order, most → least specific:
 *   1. ELEVENLABS_VOICE_ID_{LANG}_{PERSONA}   (e.g. ELEVENLABS_VOICE_ID_EN_CHILD)
 *   2. ELEVENLABS_VOICE_ID_{PERSONA}          (MALE/FEMALE already exist; adds CHILD/ELDERLY)
 *   3. VOICE_MAP[lang][persona]               (hardcoded defaults below)
 *   4. ELEVENLABS_GEORGIAN_VOICE_ID → ELEVENLABS_VOICE_ID → null
 *
 * Fail-open: returns null when nothing resolves, so the caller falls back to the
 * existing brief/gender voice selection. Pure (no I/O) and safe to import anywhere.
 */
import 'server-only';
import { KA_VOICE_MALE, KA_VOICE_FEMALE } from '@/lib/audio/georgian-voice';

export type VoiceLanguage = 'ka' | 'en' | 'ru';
/** The panel's 4 personas. NOTE: `elderly`/`child` are panel terms, distinct from
 *  filmVoiceover's internal `elder`/`young` persona union — kept separate on purpose. */
export type VoicePersonaSel = 'male' | 'female' | 'child' | 'elderly';
export type VoiceTone = 'epic' | 'emotional' | 'energetic';

/** Hardcoded per-language voice-id defaults. `ka` reuses the proven cloned Georgian
 *  voices; `en`/`ru` use ElevenLabs stock voices (spec-provided ids). child/elderly
 *  default to the female/male slot of the language until a dedicated id is set. */
export const VOICE_MAP: Record<VoiceLanguage, Record<VoicePersonaSel, string>> = {
  ka: { male: KA_VOICE_MALE, female: KA_VOICE_FEMALE, child: KA_VOICE_FEMALE, elderly: KA_VOICE_MALE },
  en: { male: 'pNInz6obpgDQGcFmaJgB', female: 'EXAVITQu4vr4xnSDxMaL', child: 'EXAVITQu4vr4xnSDxMaL', elderly: 'pNInz6obpgDQGcFmaJgB' },
  ru: { male: 'VR6AewLTigWG4xSOukaG', female: 'oWAxZDx7w5VEj9dCyTzz', child: 'oWAxZDx7w5VEj9dCyTzz', elderly: 'VR6AewLTigWG4xSOukaG' },
};

const env = (k: string): string => (process.env[k] && process.env[k]!.trim()) || '';

/** Resolve a voice id from (language, persona), honouring env overrides first. */
export function resolveVoiceId(lang: VoiceLanguage, persona: VoicePersonaSel): string | null {
  const L = lang.toUpperCase();
  const P = persona.toUpperCase();
  return (
    env(`ELEVENLABS_VOICE_ID_${L}_${P}`) ||
    env(`ELEVENLABS_VOICE_ID_${P}`) ||
    VOICE_MAP[lang]?.[persona] ||
    env('ELEVENLABS_GEORGIAN_VOICE_ID') ||
    env('ELEVENLABS_VOICE_ID') ||
    null
  );
}

/** Map a panel persona to the legacy male/female TTS gender (drives the audio duck
 *  + the Georgian model gender). child→female, elderly→male is a reasonable default. */
export function personaToGender(persona: VoicePersonaSel): 'male' | 'female' {
  return persona === 'female' || persona === 'child' ? 'female' : 'male';
}

/** Optional ElevenLabs voice-setting nudges per tone, merged OVER the model defaults
 *  (so an unset/unknown tone is a no-op). Lower stability + higher style = more
 *  expressive/dramatic; higher stability = calmer/steadier. */
export function toneToVoiceSettings(tone?: VoiceTone | null): Record<string, number> {
  switch (tone) {
    case 'epic': return { stability: 0.30, style: 0.85 };
    case 'emotional': return { stability: 0.45, style: 0.65 };
    case 'energetic': return { stability: 0.35, style: 0.75 };
    default: return {};
  }
}
