/**
 * lib/avatar/studio/chirpWords.ts — Chirp 3 word offsets for the karaoke (Speech-to-Text V2 `recognize`,
 * `features.enableWordTimeOffsets`; ka-GE is Preview). Pure: the request body and the answer's parsing. The call itself
 * is lib/avatar/studio/live (server), on the same recognizer and region as lib/voice-v2v/chirpStt, $0.016/min.
 */
import type { RecognizedWord } from './timing';
import type { ScriptLang } from './scriptScenes';

export const CHIRP_WORDS_MODEL = 'chirp_3';
const LANG_CODE: Record<ScriptLang, string> = { ka: 'ka-GE', en: 'en-US', ru: 'ru-RU' };

export function chirpWordsBody(wavBase64: string, lang: ScriptLang): Record<string, unknown> {
  return {
    config: { autoDecodingConfig: {}, model: CHIRP_WORDS_MODEL, languageCodes: [LANG_CODE[lang]], features: { enableWordTimeOffsets: true } },
    content: wavBase64,
  };
}

/** "1.250s" or { seconds, nanos } → seconds. */
export function offsetSec(v: unknown): number | null {
  if (typeof v === 'string') { const m = /^(\d+(?:\.\d+)?)s$/.exec(v.trim()); return m ? Number(m[1]) : null; }
  if (v && typeof v === 'object') {
    const o = v as { seconds?: unknown; nanos?: unknown };
    const s = Number(o.seconds ?? 0), n = Number(o.nanos ?? 0);
    return Number.isFinite(s) && Number.isFinite(n) ? s + n / 1e9 : null;
  }
  return v === undefined ? 0 : null;
}

export function parseChirpWords(raw: unknown): { words: RecognizedWord[]; heard: string } {
  const results = Array.isArray((raw as { results?: unknown })?.results) ? (raw as { results: unknown[] }).results : [];
  const words: RecognizedWord[] = [];
  const texts: string[] = [];
  for (const r of results) {
    const alt = (r as { alternatives?: Array<{ transcript?: unknown; words?: unknown }> })?.alternatives?.[0];
    if (typeof alt?.transcript === 'string' && alt.transcript.trim()) texts.push(alt.transcript.trim());
    for (const w of Array.isArray(alt?.words) ? (alt!.words as unknown[]) : []) {
      const o = w as { word?: unknown; startOffset?: unknown; endOffset?: unknown };
      const start = offsetSec(o.startOffset), end = offsetSec(o.endOffset);
      if (typeof o.word === 'string' && o.word.trim() && start !== null && end !== null) words.push({ word: o.word.trim(), start, end: Math.max(start, end) });
    }
  }
  return { words, heard: texts.join(' ').replace(/\s+/g, ' ').trim() };
}
