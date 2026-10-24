/**
 * replyLocale — detect the chat reply language from the latest message's DOMINANT script.
 *
 * Georgian (U+10A0–10FF) → 'ka', Cyrillic (U+0400–04FF) → 'ru', Latin → 'en'. Fenced/inline CODE is stripped first
 * so "explain this JS: ```…```" asked in Georgian is NOT mis-detected as English by the code's Latin characters.
 * The chat route previously only knew ka/en, so a Russian message fell through to 'en' (and the prompt's "default to
 * Georgian when ambiguous" rule could even answer a short Russian turn in Georgian). Falls back to 'ka' only when no
 * message carries a decisive script. Pure + deterministic (unit-tested); bounded regexes (no ReDoS).
 */

export type ReplyLocale = 'ka' | 'en' | 'ru';
export type LocaleMessage = { role?: string; content: unknown };

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === 'object' && (p as { type?: string }).type === 'text' ? String((p as { text?: string }).text ?? '') : ''))
      .join(' ');
  }
  return '';
}

export function detectReplyLocale(messages: readonly LocaleMessage[]): ReplyLocale {
  if (!Array.isArray(messages)) return 'ka';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    const txt = textOf(m.content);
    if (!txt) continue;
    // detect from PROSE only — strip fenced + inline code so a code-heavy message keeps its question's language
    const prose = txt.replace(/```[\s\S]{0,20000}?```/g, ' ').replace(/`[^`\n]{0,2000}`/g, ' ');
    const georgian = (prose.match(/[Ⴀ-ჿ]/g) || []).length;
    const cyrillic = (prose.match(/[Ѐ-ӿ]/g) || []).length;
    const latin = (prose.match(/[A-Za-z]/g) || []).length;
    const max = Math.max(georgian, cyrillic, latin);
    if (max === 0) continue; // no decisive script (digits/punctuation only) → check the next-older message
    if (georgian === max) return 'ka';
    if (cyrillic === max) return 'ru';
    return 'en';
  }
  return 'ka';
}

// ─── With the UI locale as a hint ────────────────────────────────────────────

export function isReplyLocale(v: unknown): v is ReplyLocale {
  return v === 'ka' || v === 'en' || v === 'ru';
}

/**
 * ⚠️ THE SCRIPT ALONE PICKED THE WRONG LANGUAGE. The route answered in whatever script dominated the latest message,
 * so "ok", "iPhone 15?" or a pasted English paragraph turned a Georgian conversation English, and the platform prompt
 * then told the model to stay there ("Reply in English. Switch only if asked"). The client now sends its UI locale
 * (`language`), and the rule is: the user's OWN words decide when they clearly are another language; anything short or
 * ambiguous follows the UI. Concretely, over the latest USER message with code, quotes, quoted lines and links removed:
 *   · Georgian or Cyrillic letters (≥ 2) are the user's language — Latin letters beside them are names, terms or
 *     pasted text ("თარგმნე: The quick brown fox…" is a Georgian request);
 *   · with a Georgian UI, Georgian typed in Latin letters ("gamarjoba", "rogor xar", "madloba") is Georgian;
 *   · Russian typed in Latin letters ("privet", "kak dela", "spasibo") is Russian;
 *   · Latin text is English when it reads as English: two words or more with an English function word
 *     ("how are you", "thank you"), or a short greeting or thanks ("hi", "Hello!", "thanks") — never "ok", "lol",
 *     "iPhone 15 Pro" or a bare term;
 *   · everything else ("?", emoji, digits, "ok") says nothing of its own: it keeps the language of the user's latest
 *     message that did say one, and the UI locale when none did.
 * With an English UI, an English sentence wraps whatever it quotes ("translate to English: გამარჯობა" stays English).
 * The prompt still lets the user ask for another language explicitly.
 *
 * ⚠️ „HI" WAS ANSWERED IN GEORGIAN, AND SO WAS RUSSIAN (GG, production 2026-10-24: „I write in English, it answers in
 * Georgian; I write in Russian, it answers in Georgian"). A one-word greeting was "too short" and followed the Georgian
 * UI, Russian in Latin letters read as nothing, and an "ok" after a Russian exchange went back to the UI's Georgian.
 */
const GEORGIAN_RE = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/g;
const CYRILLIC_RE = /[Ѐ-ӿ]/g;
/**
 * A Latin WORD — not letters glued to digits: "Core i5 13400F", "A4 paper" or "i7" must not yield the English "i" / "a"
 * that would make a bare product term read as an English sentence.
 */
const LATIN_WORD_RE = /(?<![A-Za-z0-9])[A-Za-z]{1,40}(?:'[A-Za-z]{1,10})?(?![A-Za-z0-9])/g;
const MIN_SCRIPT_LETTERS = 2;
const SCAN_CHARS = 8_000;

/** Common English words that are not names or terms: one of them in a Latin sentence makes it English. */
const ENGLISH_FUNCTION_WORDS: ReadonlySet<string> = new Set([
  'a', 'about', 'after', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'but',
  'by', 'can', 'could', 'did', 'do', 'does', 'for', 'from', 'give', 'had', 'has', 'have', 'he', 'hello', 'help', 'her',
  'here', 'hi', 'him', 'his', 'how', 'i', "i'm", 'if', 'in', 'into', 'is', 'it', "it's", 'its', 'just', 'know', 'like',
  'make', 'me', 'my', 'need', 'no', 'not', 'now', 'of', 'on', 'or', 'our', 'please', 'should', 'show', 'so', 'some',
  'tell', 'thank', 'thanks', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'up',
  'us', 'want', 'was', 'we', 'were', 'what', "what's", 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would',
  'write', 'yes', 'you', "you're", 'your',
]);

/**
 * A greeting or thanks that is English on its own: "hi", "Hello!", "thanks", "good morning". Counted only in a short
 * message (ENGLISH_GREETING_MAX_WORDS), where it is the message; "ok", "yes" and "lol" are not here, they say nothing.
 */
const ENGLISH_GREETINGS: ReadonlySet<string> = new Set([
  'hi', 'hii', 'hey', 'heya', 'hiya', 'hello', 'helo', 'howdy', 'greetings', 'morning', 'afternoon', 'evening',
  'goodnight', 'thanks', 'thank', 'thx', 'thanx', 'tnx', 'bye', 'goodbye', 'sorry',
]);
const ENGLISH_GREETING_MAX_WORDS = 3;

/**
 * Russian words as people type them in Latin letters (several spellings: zh/j, kh/h, y/i, sh/sch). Only words that are
 * not everyday English; the few that are ("net", "da", "kto") count only beside a distinctive one, as for Georgian.
 */
const LATIN_RUSSIAN_WORDS: ReadonlySet<string> = new Set([
  'privet', 'privetik', 'zdravstvuy', 'zdravstvuyte', 'zdravstvujte', 'zdravstvuite', 'zdorovo', 'dobroe', 'dobryy',
  'dobryi', 'dobriy', 'dobry', 'utro', 'vecher', 'dela', 'delo', 'kak', 'chto', 'shto', 'eto', 'etot', 'eta',
  'spasibo', 'spasiba', 'pozhaluysta', 'pozhalujsta', 'pojaluysta', 'pojalusta', 'pozhalusta', 'poka', 'khorosho',
  'horosho', 'xorosho', 'plokho', 'ploho', 'normalno', 'otlichno', 'ladno', 'konechno', 'nichego', 'menya', 'mne',
  'tebya', 'tebe', 'mozhno', 'mojno', 'mozhesh', 'mojesh', 'mozhete', 'mojete', 'mogu', 'nado',
  'nuzhno', 'nujno', 'khochu', 'hochu', 'xochu', 'znayu', 'znaesh', 'ponyal', 'ponyala', 'napishi', 'napisat',
  'rasskazhi', 'raskaji', 'skazhi', 'skaji', 'pomogi', 'pomoch', 'sdelay', 'sdelai', 'davay', 'davai', 'pokazhi',
  'segodnya', 'zavtra', 'vchera', 'seychas', 'sejchas', 'sichas', 'gde', 'kogda', 'pochemu', 'zachem', 'skolko',
  'kakoy', 'kakoi', 'kakaya', 'kakie', 'ochen', 'tozhe', 'toje', 'tolko', 'uzhe', 'uje', 'yeshche', 'eshche', 'eshe',
  'esche', 'vse', 'vsyo', 'vsio', 'budet', 'byl', 'byla', 'mozhet', 'mojet', 'potom', 'zdes', 'tam', 'tut', 'kuda',
  'russkiy', 'russkii', 'russki', 'porusski', 'russkom', 'angliyskom', 'gruzinskom', 'bratan', 'krasivo',
  'interesno', 'pravda', 'tochno', 'voobshche', 'voobshe', 'prosto', 'sovsem', 'vremya', 'rabota', 'rabotaet',
  'kartinku', 'pesnyu', 'stikh', 'stih',
]);
/** Everyday English (or Georgian translit) words that are also Russian: they count only beside a distinctive word. */
const LATIN_RUSSIAN_WEAK: ReadonlySet<string> = new Set([
  'da', 'net', 'ne', 'ya', 'ty', 'vy', 'on', 'ona', 'oni', 'my', 'i', 'v', 'na', 's', 'k', 'u', 'o', 'a', 'no', 'kto',
  'tak', 'nu', 'vot', 'pro', 'dlya', 'dlia', 'ili', 'vas', 'vam', 'nam', 'po',
]);

/**
 * Georgian words as people type them in Latin letters (x/kh, q/k, ts/c, sh, ch, dz variants). Only words that are not
 * also everyday English; the few that are ("me", "da") count only beside a distinctive one (see `latinGeorgian`).
 */
const LATIN_GEORGIAN_WORDS: ReadonlySet<string> = new Set([
  'gamarjoba', 'gamarjobat', 'gaumarjos', 'madloba', 'madlobt', 'gmadlob', 'gmadlobt', 'didi', 'dzalian', 'dzaan',
  'kargad', 'kargi', 'karg', 'kai', 'cudad', 'tsudad', 'rogor', 'rogora', 'rogorc', 'xar', 'khar', 'xart', 'khart',
  'vart', 'aris', 'arian', 'ras', 'raa', 'rato', 'ratom', 'rodis', 'sadac', 'ramdeni', 'romeli', 'aketeb',
  'aketebt', 'akete', 'vaketeb', 'gaakete', 'gaaketo', 'shegidzlia', 'shegidzliat', 'sheidzleba', 'sheizleba', 'minda',
  'gvinda', 'ginda', 'unda', 'mchirdeba', 'damexmare', 'damekhmare', 'mitxari', 'mitkhari', 'momeci', 'mometsi',
  'momwere', 'damiwere', 'dawere', 'gtxov', 'gtxovt', 'gtkhov', 'gtkhovt', 'genacvale', 'genatsvale', 'bodishi',
  'ukacravad', 'ukatsravad', 'kartulad', 'kartuli', 'inglisurad', 'rusulad', 'tqven', 'tkven', 'shen', 'chven',
  'isini', 'axla', 'akhla', 'dges', 'xval', 'khval', 'gushin', 'yvela', 'kvela', 'yvelaferi', 'kvelaferi', 'mainc',
  'magram', 'tumca', 'radgan', 'imitom', 'mokled', 'albat', 'namdvilad', 'zustad', 'ubralod', 'cota', 'tsota',
  'bevri', 'lamazi', 'magari', 'kaci', 'katsi', 'bavshvi', 'megobari', 'megobaro', 'dzmao', 'vici', 'ara',
  'diax', 'kho', 'gavige', 'mesmis', 'gesmis', 'kidev', 'isev', 'ukve', 'sheni', 'chemi', 'chveni', 'tqveni',
  'tkveni', 'misi', 'raime', 'rame', 'vinme', 'xdeba', 'khdeba', 'iqneba', 'ikneba', 'naxvamdis', 'nakhvamdis',
  'mshvidobit', 'dilamshvidobisa', 'sagamo', 'saghamo', 'kargia',
]);
/** Everyday English words that are also Georgian ("me" = I, "da" = and): they count only beside a distinctive word. */
const LATIN_GEORGIAN_WEAK: ReadonlySet<string> = new Set(['me', 'da', 'es', 'ra', 'ar', 'ki', 'an', 'tu', 'rom', 'ver', 'sad', 'xo']);
/** Georgian case and plural endings ("-eba", "-oba", "-ebi", "-tvis") that no common English word has. */
const LATIN_GEORGIAN_SUFFIX_RE = /^[a-z]{2,30}(?:eba|oba|ebi|ebma|ebis|tvis)$/;

/** The user's own prose: no fenced / inline code, no quoted passages or "> " lines, no links. */
function ownWords(text: string): string {
  return text
    .slice(0, SCAN_CHARS)
    .replace(/```[\s\S]{0,8000}?```/g, ' ')
    .replace(/`[^`\n]{0,2000}`/g, ' ')
    .replace(/^[ \t]{0,8}>[^\n]{0,4000}$/gm, ' ')
    .replace(/"[^"\n]{1,2000}"|“[^”\n]{1,2000}”|„[^“”\n]{1,2000}[“”]|«[^»\n]{1,2000}»/g, ' ')
    .replace(/https?:\/\/\S{1,2048}/gi, ' ');
}

function latinWords(prose: string): string[] {
  return (prose.match(LATIN_WORD_RE) ?? []).map((w) => w.toLowerCase());
}

/** Latin text that reads as English (see the rule above). */
function readsAsEnglish(words: readonly string[]): boolean {
  if (words.length && words.length <= ENGLISH_GREETING_MAX_WORDS && words.some((w) => ENGLISH_GREETINGS.has(w))) return true;
  if (words.length < 2) return false;
  return words.some((w) => ENGLISH_FUNCTION_WORDS.has(w));
}

/** Russian typed in Latin letters: two distinctive words, or one that, with the weak ones, is half the message. */
function latinRussian(words: readonly string[]): boolean {
  let strong = 0;
  let weak = 0;
  for (const w of words) {
    if (LATIN_RUSSIAN_WORDS.has(w)) strong++;
    else if (LATIN_RUSSIAN_WEAK.has(w)) weak++;
  }
  return strong >= 2 || (strong >= 1 && (strong + weak) * 2 >= words.length);
}

/** Georgian typed in Latin letters: two distinctive words, or one that, with the weak ones, is half the message. */
function latinGeorgian(words: readonly string[]): boolean {
  let strong = 0;
  let weak = 0;
  for (const w of words) {
    if (LATIN_GEORGIAN_WORDS.has(w) || LATIN_GEORGIAN_SUFFIX_RE.test(w)) strong++;
    else if (LATIN_GEORGIAN_WEAK.has(w)) weak++;
  }
  return strong >= 2 || (strong >= 1 && (strong + weak) * 2 >= words.length);
}

/**
 * The language one message's text says of its own, given the UI locale, or null when it says none ("ok", "?", an emoji,
 * a product name). Pure; exported for tests.
 */
export function ownLocaleForText(text: string, uiLocale: ReplyLocale): ReplyLocale | null {
  const prose = ownWords(typeof text === 'string' ? text : '');
  const ka = (prose.match(GEORGIAN_RE) ?? []).length;
  const ru = (prose.match(CYRILLIC_RE) ?? []).length;
  const words = latinWords(prose);
  const nonLatin: ReplyLocale | null = Math.max(ka, ru) >= MIN_SCRIPT_LETTERS ? (ka >= ru ? 'ka' : 'ru') : null;

  if (uiLocale === 'en') {
    if (readsAsEnglish(words)) return 'en';
    if (nonLatin) return nonLatin;
    return latinRussian(words) ? 'ru' : null;
  }
  if (nonLatin) return nonLatin;
  if (uiLocale === 'ka' && latinGeorgian(words)) return 'ka';
  if (latinRussian(words)) return 'ru';
  if (readsAsEnglish(words)) return 'en';
  return null;
}

/** The reply language for one message's text alone, given the UI locale. Pure; exported for tests. */
export function replyLocaleForText(text: string, uiLocale: ReplyLocale): ReplyLocale {
  return ownLocaleForText(text, uiLocale) ?? uiLocale;
}

/** How many of the latest user messages an "ok" looks back through for the conversation's language. */
const LOOKBACK_USER_MESSAGES = 8;

/**
 * The chat's reply language. With a valid `uiLocale` (the client's `language`), the latest USER message decides as
 * described above; one that says no language of its own keeps the language of the latest user message that did (up to
 * LOOKBACK_USER_MESSAGES back), else the UI locale. Without one (an older client), the legacy dominant-script detection.
 */
export function resolveReplyLocale(messages: readonly LocaleMessage[], uiLocale?: unknown): ReplyLocale {
  if (!isReplyLocale(uiLocale)) return detectReplyLocale(messages);
  if (!Array.isArray(messages)) return uiLocale;
  let seen = 0;
  for (let i = messages.length - 1; i >= 0 && seen < LOOKBACK_USER_MESSAGES; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    seen++;
    const own = ownLocaleForText(textOf(m.content), uiLocale);
    if (own) return own;
  }
  return uiLocale;
}
