/**
 * lib/ai/musicVocals.ts — the sentences that make Lyria actually SING (GG 2026-10-26: "songs come out without vocals").
 *
 * Lyria 3 sings by default and goes instrumental on the word "instrumental", but a bare description ("a summer song
 * about Batumi") often comes back as a backing track: nothing asked for a lead vocal, words, or a chorus. Google's
 * prompting guide for Lyria 3 builds a song as [genre + mood] + [instruments] + [tempo] + [vocal style & language] +
 * [lyrics], with the structure named (intro, verse, chorus). These are the vocal-style, language and structure parts.
 *
 * The language: the description is translated to English before Lyria sees it (lib/ai/promptToEnglish), so without a
 * direction a Georgian brief is sung in English. The script the person wrote in (description or lyrics) names the
 * language, unless the brief already names one ("in Spanish"), which wins. Google lists eight vocal languages for
 * Lyria 3 (en, de, es, fr, hi, ja, ko, pt); Georgian and Russian are not among them, so they are asked for, not promised.
 *
 * Pure: no network, no env.
 */

export type SongLanguage = 'Georgian' | 'Russian';

const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/;
const CYRILLIC = /[Ѐ-ӿ]/;
/** A brief that already names the singing language (in English, after translation) keeps it. */
const NAMED_LANGUAGE = /\b(in|into)\s+(english|german|spanish|french|hindi|japanese|korean|portuguese|georgian|russian|italian|turkish|arabic|ukrainian|armenian|greek|chinese|polish)\b/i;

/** The language the person wrote in, read from their own (untranslated) words. Lyrics weigh first: they are what is sung. */
export function songLanguageOf(...texts: Array<string | undefined>): SongLanguage | null {
  for (const t of texts) {
    if (!t) continue;
    if (GEORGIAN.test(t)) return 'Georgian';
    if (CYRILLIC.test(t)) return 'Russian';
  }
  return null;
}

/**
 * The song directions for a SUNG track, in English: a lead vocal, the language, a song structure, and — when the person
 * gave no words — that Lyria writes them. `targetSec` sizes the structure (the clip is 30 s). Empty for an instrumental. `briefEn` is the translated description, checked
 * only for a language it already names.
 */
export function songDirections(input: { instrumental: boolean; hasLyrics: boolean; language: SongLanguage | null; briefEn?: string; targetSec?: number }): string[] {
  if (input.instrumental) return [];
  const out = ['A complete song with a clear, expressive lead vocal singing real words, mixed up front over the music'];
  if (input.language && !NAMED_LANGUAGE.test(input.briefEn ?? '')) out.push(`Sung in ${input.language}`);
  out.push(input.hasLyrics
    ? 'Sing the lyrics below as written, with a memorable, catchy chorus'
    : 'Write original, meaningful lyrics about the description, with a memorable, catchy chorus');
  // A 30 s clip has room for one verse and the chorus; a longer Pro track gets the whole form.
  out.push((input.targetSec ?? 30) > 30
    ? 'Song structure: short intro, verse, chorus, verse, chorus, bridge, final chorus, outro'
    : 'Song structure: a two-bar intro, one verse, then the chorus');
  return out;
}
