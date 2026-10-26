/**
 * lib/voice/heardScript.ts — Georgian heard in another alphabet, written back in Georgian letters.
 *
 * ⚠️ GG 2026-10-26, voice calls: Gemini Live's input transcription wrote Georgian words in Hindi letters („क्रेटा", 05:27Z)
 * and then a „კი" in Arabic ones („كي?", 06:23Z), although the setup names ka-GE, en-US and ru-RU
 * (lib/voice/voicePrompt liveTranscriptionLanguages). Those codes are a hint, not a lock. A caption in another alphabet
 * means nothing to the user, and a „კი" written „की" or „كي" is no yes to lib/voice/spokenYes, so the call could never
 * start what the user agreed to. The product's calls are Georgian, English or Russian only: Devanagari, Arabic (and
 * Persian) and Armenian letters are always a mis-heard language, and the sounds they spell are put back in Georgian
 * letters. It is an approximation by sound, good for short words (की/كي/կի → კი, हो/هو/հո → ჰო, कारगी/كارگي → კარგი).
 * Pure and isomorphic; text in no such alphabet comes back unchanged.
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
function devanagariWord(run: string): string {
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

/**
 * Arabic and Persian letters by sound. Short vowels are rarely written, so a word reads as its consonants and long vowels
 * (كي → კი, كارگي → კარგი, دياخ → დიახ); و is ვ at a word's start and ო after it; the vowel marks, when present, are ა ი უ.
 */
const ARABIC: Readonly<Record<string, string>> = {
  'ا': 'ა', 'آ': 'ა', 'أ': 'ა', 'إ': 'ი', 'ى': 'ა', 'ة': 'ა', 'ء': '', 'ؤ': 'ო', 'ئ': 'ი',
  'ب': 'ბ', 'ت': 'ტ', 'ث': 'ს', 'ج': 'ჯ', 'ح': 'ჰ', 'خ': 'ხ', 'د': 'დ', 'ذ': 'ზ', 'ر': 'რ', 'ز': 'ზ',
  'س': 'ს', 'ش': 'შ', 'ص': 'ს', 'ض': 'დ', 'ط': 'ტ', 'ظ': 'ზ', 'ع': '', 'غ': 'ღ', 'ف': 'ფ', 'ق': 'ყ',
  'ك': 'კ', 'ل': 'ლ', 'م': 'მ', 'ن': 'ნ', 'ه': 'ჰ', 'و': 'ო', 'ي': 'ი',
  'پ': 'პ', 'چ': 'ჩ', 'ژ': 'ჟ', 'ڤ': 'ვ', 'ک': 'კ', 'گ': 'გ', 'ی': 'ი',
  '\u064E': 'ა', '\u0650': 'ი', '\u064F': 'უ', '\u0670': 'ა',
  '،': ',', '؛': ';', '؟': '?',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/** One word of Arabic letters (no spaces) → Georgian letters. Ligatures and presentation forms are unfolded first. */
function arabicWord(run: string): string {
  const chars = [...run.normalize('NFKC')];
  return chars.map((ch, i) => (ch === 'و' && i === 0 ? 'ვ' : ARABIC[ch] ?? '')).join('').replace(/ი{2,}/gu, 'ი');
}

/** Armenian letters by sound: its ejectives are Georgian's (կ კ, տ ტ, պ პ, ծ წ, ճ ჭ), ու is უ, ը is not written. */
const ARMENIAN: Readonly<Record<string, string>> = {
  'ա': 'ა', 'բ': 'ბ', 'գ': 'გ', 'դ': 'დ', 'ե': 'ე', 'զ': 'ზ', 'է': 'ე', 'ը': '', 'թ': 'თ', 'ժ': 'ჟ',
  'ի': 'ი', 'լ': 'ლ', 'խ': 'ხ', 'ծ': 'წ', 'կ': 'კ', 'հ': 'ჰ', 'ձ': 'ძ', 'ղ': 'ღ', 'ճ': 'ჭ', 'մ': 'მ',
  'յ': 'ი', 'ն': 'ნ', 'շ': 'შ', 'ո': 'ო', 'չ': 'ჩ', 'պ': 'პ', 'ջ': 'ჯ', 'ռ': 'რ', 'ս': 'ს', 'վ': 'ვ',
  'տ': 'ტ', 'ր': 'რ', 'ց': 'ც', 'ւ': 'ვ', 'փ': 'ფ', 'ք': 'ქ', 'օ': 'ო', 'ֆ': 'ფ', 'և': 'ევ',
  '։': '.', '՝': ',',
};

/** One word of Armenian letters (no spaces) → Georgian letters. */
function armenianWord(run: string): string {
  return [...run.normalize('NFKC').toLowerCase().replace(/ու/gu, 'უ')].map((ch) => (ch === 'უ' ? ch : ARMENIAN[ch] ?? '')).join('');
}

const DEVANAGARI_RUN = /[\u0900-\u097F]+/gu;
const ARABIC_RUN = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/gu;
const ARMENIAN_RUN = /[\u0530-\u058F\uFB13-\uFB17]+/gu;
const MISHEARD = /[\u0900-\u097F\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u0530-\u058F\uFB13-\uFB17]/u;

/** Whether the transcription wrote any of these words in an alphabet the call never speaks (its punctuation is a guess). */
export function isMisheardScript(text: string): boolean {
  return typeof text === 'string' && MISHEARD.test(text);
}

/** The call's heard words with every Devanagari, Arabic or Armenian word in Georgian letters; the rest as it is. */
export function toCallScript(text: string): string {
  if (!isMisheardScript(text)) return typeof text === 'string' ? text : '';
  return text.replace(DEVANAGARI_RUN, devanagariWord).replace(ARABIC_RUN, arabicWord).replace(ARMENIAN_RUN, armenianWord);
}
