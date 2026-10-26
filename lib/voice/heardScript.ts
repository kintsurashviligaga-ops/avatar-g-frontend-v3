/**
 * lib/voice/heardScript.ts — Georgian heard in Hindi letters, written back in Georgian ones.
 *
 * ⚠️ GG 2026-10-26, a voice call: a Georgian word came back from Gemini Live's input transcription as „क्रेटा"
 * (Devanagari), although the setup names ka-GE, en-US and ru-RU (lib/voice/voicePrompt liveTranscriptionLanguages).
 * Those codes are a hint, not a lock. A caption in Hindi letters means nothing to the user, and a „კი" written „की" is no
 * yes to lib/voice/spokenYes, so the call could never start what the user agreed to. The product's calls are Georgian,
 * English or Russian only: Devanagari is always a mis-heard language, and the sounds it spells are put back in Georgian
 * letters. It is an approximation by sound, good for short words (की → კი, हो → ჰო, कारगी → კარგი, क्रेटा → კრეტა).
 * Pure and isomorphic; text without Devanagari comes back unchanged.
 */

const VIRAMA = '्';
const NUKTA = '़';

/** Consonants by sound: unaspirated stops as Georgian ejectives (კ ტ პ ჭ), aspirated ones as ქ თ ფ ჩ. */
const CONSONANTS: Readonly<Record<string, string>> = {
  'क': 'კ', 'ख': 'ქ', 'ग': 'გ', 'घ': 'გ', 'ङ': 'ნ',
  'च': 'ჭ', 'छ': 'ჩ', 'ज': 'ჯ', 'झ': 'ჯ', 'ञ': 'ნ',
  'ट': 'ტ', 'ठ': 'თ', 'ड': 'დ', 'ढ': 'დ', 'ण': 'ნ',
  'त': 'ტ', 'थ': 'თ', 'द': 'დ', 'ध': 'დ', 'न': 'ნ',
  'प': 'პ', 'फ': 'ფ', 'ब': 'ბ', 'भ': 'ბ', 'म': 'მ',
  'य': 'ი', 'र': 'რ', 'ल': 'ლ', 'ळ': 'ლ', 'व': 'ვ',
  'श': 'შ', 'ष': 'შ', 'स': 'ს', 'ह': 'ჰ',
};

/** The dotted (nukta) letters Hindi borrows for sounds Georgian has: क़ ყ, ख़ ხ, ग़ ღ, ज़ ზ. */
const WITH_NUKTA: Readonly<Record<string, string>> = {
  'क': 'ყ', 'ख': 'ხ', 'ग': 'ღ', 'ज': 'ზ', 'ड': 'რ', 'ढ': 'რ', 'फ': 'ფ',
};

const VOWELS: Readonly<Record<string, string>> = {
  'अ': 'ა', 'आ': 'ა', 'इ': 'ი', 'ई': 'ი', 'उ': 'უ', 'ऊ': 'უ', 'ऋ': 'რი',
  'ए': 'ე', 'ऐ': 'ე', 'ऍ': 'ე', 'ऎ': 'ე', 'ओ': 'ო', 'औ': 'ო', 'ऑ': 'ო', 'ऒ': 'ო',
};

/** Vowel signs written after a consonant. */
const SIGNS: Readonly<Record<string, string>> = {
  'ा': 'ა', 'ि': 'ი', 'ी': 'ი', 'ु': 'უ', 'ू': 'უ', 'ृ': 'რი',
  'े': 'ე', 'ै': 'ე', 'ॅ': 'ე', 'ॆ': 'ე', 'ो': 'ო', 'ौ': 'ო', 'ॉ': 'ო', 'ॊ': 'ო',
};

/** Marks that stand on their own: anusvara is an n, visarga an h, chandrabindu only nasalises (dropped). */
const MARKS: Readonly<Record<string, string>> = {
  'ं': 'ნ', 'ः': 'ჰ', 'ँ': '', '।': '.', '॥': '.', 'ॐ': 'ომ',
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

/** One spelled sound: a consonant with its vowel (`v` null = the unwritten „a" every bare consonant carries). */
type Unit = { c: string; v: string | null } | { c: ''; v: string; mark?: true };

const hasVowel = (u: Unit | undefined): boolean => !!u && (u.v === null || u.v !== '') && !('mark' in u && u.mark);

/** One word of Devanagari (no spaces) → Georgian letters. */
function word(run: string): string {
  const chars = [...run.normalize('NFD')];
  const units: Unit[] = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    if (CONSONANTS[ch] !== undefined) {
      let c = CONSONANTS[ch]!;
      if (chars[i + 1] === NUKTA) { c = WITH_NUKTA[ch] ?? c; i += 1; }
      const next = chars[i + 1];
      let v: string | null = null;
      if (next === VIRAMA) { v = ''; i += 1; } else if (next !== undefined && SIGNS[next] !== undefined) { v = SIGNS[next]!; i += 1; }
      units.push({ c, v });
    } else if (VOWELS[ch] !== undefined) {
      units.push({ c: '', v: VOWELS[ch]! });
    } else if (MARKS[ch] !== undefined) {
      units.push({ c: '', v: MARKS[ch]!, mark: true });
    }
    // Anything else (a stray nukta, a joiner, an unknown sign) is dropped.
  }
  // Hindi does not say every written „a": not at a word's end, nor between a vowel and a consonant that has its own vowel
  // („कारगी" is kārgī, not kāragī). Decided right to left, so each choice sees the ones after it.
  for (let i = units.length - 1; i >= 0; i -= 1) {
    const u = units[i]!;
    if (u.c === '' || u.v !== null) continue;
    const last = i === units.length - 1;
    const next = units[i + 1];
    const between = i > 0 && hasVowel(units[i - 1]) && !!next && next.c !== '' && hasVowel(next);
    if ((last && i > 0) || between) u.v = '';
  }
  return units.map((u) => u.c + (u.v === null ? 'ა' : u.v)).join('').replace(/ი{2,}/gu, 'ი');
}

/** The call's heard words with every Devanagari word written in Georgian letters; anything else is left as it is. */
export function toCallScript(text: string): string {
  if (typeof text !== 'string' || !/[ऀ-ॿ]/u.test(text)) return typeof text === 'string' ? text : '';
  return text.replace(/[ऀ-ॿ]+/gu, word);
}
