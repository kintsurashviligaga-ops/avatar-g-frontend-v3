/**
 * PHASE 48 §3 / v329 — ElevenLabs model + language selection for TTS.
 *
 * THE PRODUCTION BUG THIS FIXES
 * -----------------------------
 * Georgian narration sounded robotic/accented. Root cause (verified against the
 * live ElevenLabs account): the code used `eleven_multilingual_v2`, whose
 * supported-language list does NOT include Georgian (`ka`) — so it only
 * approximated Georgian phonemes through other languages. Of all ElevenLabs
 * models, ONLY `eleven_v3` lists `ka` as a supported language. Routing Georgian
 * to `eleven_v3` is the actual fix (no Google key required). Turbo stays the
 * low-latency default for English; multilingual_v2 covers its 29 languages.
 *
 * This module is the single, pure source of truth for that decision so it can
 * be unit-tested in isolation and reused anywhere TTS is dispatched.
 */

/** ElevenLabs synthesis models we route between. */
export type ElevenLabsModelId = 'eleven_v3' | 'eleven_multilingual_v2' | 'eleven_turbo_v2_5';

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
 * Georgian → `eleven_v3` (the ONLY ElevenLabs model that supports `ka`).
 * Everything else → `eleven_turbo_v2_5` (low-latency English-first default).
 *
 * Pure: no env, no I/O — just the language decision.
 */
export function selectTtsModel(text: string, locale?: string | null): ElevenLabsModelId {
  return isGeorgianText(text, locale) ? 'eleven_v3' : 'eleven_turbo_v2_5';
}

/**
 * Voice settings tuned per model for NATURAL, human-like delivery.
 *
 * The old multilingual preset used stability 0.82 — far too high, which made the
 * Georgian read flat and robotic (the live complaint). ElevenLabs stability is
 * the expressiveness dial: high = monotone/consistent, low = lively/human. 0.5 is
 * the sweet spot for Georgian on multilingual_v2 — the voice breathes and intones
 * like a person WITHOUT the vowel-warble that very low values cause. A higher
 * `style` adds prosodic variation; speaker_boost + full similarity keep it clear
 * and present; speed 1.0 is a natural pace.
 */
export function voiceSettingsForModel(model: ElevenLabsModelId): {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
} {
  if (model === 'eleven_v3') {
    // Georgian on eleven_v3 (natively supported). v3's `stability` behaves like
    // Creative(0)/Natural(0.5)/Robust(1): 0.5 gives an expressive-yet-steady human
    // read. Low `style` keeps it from over-acting; full similarity + speaker_boost
    // hold the voice identity; natural pace.
    return { stability: 0.5, similarity_boost: 0.9, style: 0.1, use_speaker_boost: true, speed: 1.0 };
  }
  if (model === 'eleven_multilingual_v2') {
    // Georgian, retuned for a natural, accent-light human read. The previous
    // style:0.55 OVER-exaggerated prosody on the non-native voice, which read as
    // artificial/robotic; ElevenLabs `style` introduces artifacts as it rises, so
    // for low-resource Georgian a LOW style (0.18) sounds far more human. Stability
    // 0.48 keeps it lively but steady (no vowel-warble), full similarity_boost +
    // speaker_boost keep the timbre on-voice and present, and speed 0.96 gives the
    // Georgian phonemes a touch more room (less rushed/clipped = less robotic).
    return { stability: 0.48, similarity_boost: 0.9, style: 0.18, use_speaker_boost: true, speed: 0.96 };
  }
  return { stability: 0.45, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true, speed: 1.0 };
}
