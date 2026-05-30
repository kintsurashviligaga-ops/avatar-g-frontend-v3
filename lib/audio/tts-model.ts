/**
 * PHASE 48 §3 — ElevenLabs model + language selection for TTS.
 *
 * THE PRODUCTION BUG THIS FIXES
 * -----------------------------
 * The TTS route hard-coded `eleven_turbo_v2_5` for EVERY request. Turbo is an
 * English-first, latency-optimized model; fed Georgian text it produces broken
 * or heavily English-accented phonemes. Georgian must run on
 * `eleven_multilingual_v2`, which carries a stable Georgian phoneme set.
 *
 * This module is the single, pure source of truth for that decision so it can
 * be unit-tested in isolation and reused anywhere TTS is dispatched.
 */

/** ElevenLabs synthesis models we route between. */
export type ElevenLabsModelId = 'eleven_multilingual_v2' | 'eleven_turbo_v2_5';

/** Georgian (Mkhedruli) Unicode block: U+10A0–U+10FF. */
const GEORGIAN_RANGE = /[Ⴀ-ჿ]/;

/**
 * True when the text contains Georgian script OR the caller flagged the locale
 * as Georgian. Either signal is sufficient — a user can type Georgian while the
 * UI locale is English, and vice-versa.
 */
export function isGeorgianText(text: string, locale?: string | null): boolean {
  if (locale && locale.toLowerCase().startsWith('ka')) return true;
  return GEORGIAN_RANGE.test(text ?? '');
}

/**
 * Select the ElevenLabs model for a synthesis request.
 *
 * Georgian → `eleven_multilingual_v2` (phonetically stable, non-English).
 * Everything else → `eleven_turbo_v2_5` (low-latency English-first default).
 *
 * Pure: no env, no I/O — just the language decision.
 */
export function selectTtsModel(text: string, locale?: string | null): ElevenLabsModelId {
  return isGeorgianText(text, locale) ? 'eleven_multilingual_v2' : 'eleven_turbo_v2_5';
}

/**
 * Voice settings tuned per model. Multilingual benefits from slightly higher
 * stability so Georgian vowels don't warble; turbo keeps the snappier default.
 */
export function voiceSettingsForModel(model: ElevenLabsModelId): {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
} {
  if (model === 'eleven_multilingual_v2') {
    return { stability: 0.82, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true, speed: 0.98 };
  }
  return { stability: 0.75, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true, speed: 0.95 };
}
