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
 *   · Latin text is English only when it reads as English: two words or more with an English function word
 *     ("how are you", "thank you") — never "ok", "lol", "iPhone 15 Pro" or a bare term;
 *   · everything else ("?", emoji, digits, one word) is the UI locale.
 * With an English UI, an English sentence wraps whatever it quotes ("translate to English: გამარჯობა" stays English).
 * The prompt still lets the user ask for another language explicitly.
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
  if (words.length < 2) return false;
  return words.some((w) => ENGLISH_FUNCTION_WORDS.has(w));
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

/** The reply language for one message's text, given the UI locale. Pure; exported for tests. */
export function replyLocaleForText(text: string, uiLocale: ReplyLocale): ReplyLocale {
  const prose = ownWords(typeof text === 'string' ? text : '');
  const ka = (prose.match(GEORGIAN_RE) ?? []).length;
  const ru = (prose.match(CYRILLIC_RE) ?? []).length;
  const words = latinWords(prose);
  const nonLatin: ReplyLocale | null = Math.max(ka, ru) >= MIN_SCRIPT_LETTERS ? (ka >= ru ? 'ka' : 'ru') : null;

  if (uiLocale === 'en') {
    if (readsAsEnglish(words)) return 'en';
    return nonLatin ?? 'en';
  }
  if (nonLatin) return nonLatin;
  if (uiLocale === 'ka' && latinGeorgian(words)) return 'ka';
  if (readsAsEnglish(words)) return 'en';
  return uiLocale;
}

/**
 * The chat's reply language. With a valid `uiLocale` (the client's `language`), the latest USER message decides as
 * described above; without one (an older client), the legacy dominant-script detection.
 */
export function resolveReplyLocale(messages: readonly LocaleMessage[], uiLocale?: unknown): ReplyLocale {
  if (!isReplyLocale(uiLocale)) return detectReplyLocale(messages);
  if (!Array.isArray(messages)) return uiLocale;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') return replyLocaleForText(textOf(m.content), uiLocale);
  }
  return uiLocale;
}
