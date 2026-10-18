/**
 * lib/ai/musicGenreWords.ts — does the user's OWN description already name a genre? Pure, no network.
 *
 * ⚠️ PRODUCTION 2026-10-18 (GG): „ჟანრებს ვუთითებ პრომპტში, სონგ დისკრიპშენში, და არასწორად აკეთებს". The Music panel opens
 * in Simple mode, which shows only the description box, yet the panel's hidden genre chip (MUSIC_PANEL_DEFAULTS.genre,
 * R&B) still travelled with every request, and the brief ended „… my blues song about the road. Style: r&b." Lyria
 * follows the explicit style line, so the user's genre lost. The rule now: the words the user typed win. When their
 * description names a genre, a panel style the description does not mention is left out of the brief.
 *
 * ⚠️ NO `\b` (ASCII-only: it never matches next to Georgian or Cyrillic) — the stems below are matched as substrings of
 * the lower-cased text, which is safe for these words (none is a fragment of an everyday word that matters here).
 */

/** Genre stems, ka · en · ru. A stem, so „ბლუზის", „джазовая", „rock'n'roll" all match. */
const GENRE_STEMS: readonly string[] = [
  // English (a Georgian brief is translated to English before the brief is built, so these carry most of the weight)
  'blues', 'jazz', 'rock', 'metal', 'punk', 'grunge', 'pop', 'hip-hop', 'hip hop', 'hiphop', 'rap', 'trap', 'drill', 'r&b',
  'rnb', 'soul', 'funk', 'disco', 'house', 'techno', 'trance', 'edm', 'dubstep', 'drum and bass', 'drum & bass', 'dnb',
  'electronic', 'synthwave', 'lo-fi', 'lofi', 'ambient', 'classical', 'orchestral', 'symphon', 'opera', 'cinematic',
  'folk', 'country', 'bluegrass', 'reggae', 'reggaeton', 'latin', 'salsa', 'tango', 'bossa', 'samba', 'flamenco',
  'gospel', 'k-pop', 'kpop', 'afrobeat', 'indie', 'acoustic', 'ballad', 'chanson', 'polyphon', 'a cappella', 'acapella',
  'swing', 'bebop', 'waltz', 'march', 'lullaby', 'phonk', 'emo', 'ska',
  // Georgian
  'ბლუზ', 'ჯაზ', 'როკ', 'მეტალ', 'პანკ', 'პოპ', 'ჰიპ-ჰოპ', 'ჰიპჰოპ', 'ჰიპ ჰოპ', 'რეპ', 'ტრეპ', 'სოულ', 'ფანკ', 'დისკო',
  'ჰაუს', 'ტექნო', 'ტრანს', 'ელექტრონულ', 'ამბიენტ', 'კლასიკურ', 'ორკესტრ', 'სიმფონი', 'ოპერ', 'ფოლკ', 'ხალხურ',
  'ქანთრი', 'რეგი', 'ლათინურ', 'სალსა', 'ტანგო', 'გოსპელ', 'ინდი', 'აკუსტიკურ', 'ბალად', 'შანსონ', 'პოლიფონი',
  'მრავალხმიან', 'ვალს', 'მარშ', 'იავნანა', 'ლოფაი',
  // Russian
  'блюз', 'джаз', 'рок', 'метал', 'панк', 'поп', 'хип-хоп', 'хип хоп', 'рэп', 'трэп', 'соул', 'фанк', 'диско', 'хаус',
  'техно', 'транс', 'электрон', 'эмбиент', 'классическ', 'оркестр', 'симфони', 'опер', 'фолк', 'народн', 'кантри',
  'регги', 'латин', 'сальса', 'танго', 'госпел', 'инди', 'акустическ', 'баллад', 'шансон', 'вальс', 'марш',
  'колыбельн',
];

const norm = (s: string): string => s.normalize('NFKC').toLowerCase();

/** Every genre stem the text names (deduplicated, in list order). */
export function genresNamedIn(text: string | undefined | null): string[] {
  if (!text) return [];
  const s = norm(text);
  // „pop" inside „popular", „rap" inside „wrap", „rock" inside „rocky road", „emo" inside „memory": an English stem of
  // ≤ 4 letters must start a word (a letter before it disqualifies it). Georgian and Cyrillic stems are matched freely.
  return GENRE_STEMS.filter((g) => {
    if (!/^[a-z&]+$/.test(g) || g.length > 4) return s.includes(g);
    const at = [...s.matchAll(new RegExp(g.replace(/[&]/g, '\\&'), 'g'))];
    return at.some((m) => {
      const before = m.index! > 0 ? s[m.index! - 1]! : ' ';
      const after = s[m.index! + g.length] ?? ' ';
      // The word must start here; it may run on („rocks", „jazzy", „poppy") but not into another stem-free word („popular").
      return !/[\p{L}\p{N}]/u.test(before) && !(g === 'pop' && /^ular/.test(s.slice(m.index! + 3))) && !(g === 'emo' && /^t/.test(after));
    });
  });
}

/**
 * The style line to put in the brief, given the user's description: the panel's style when the description names no
 * genre (or names the same one), otherwise nothing — the user's own words already say what it is.
 */
export function styleForBrief(style: string | undefined | null, description: string | undefined | null): string {
  const st = (style ?? '').trim();
  if (!st) return '';
  const named = genresNamedIn(description);
  if (!named.length) return st;
  const panel = genresNamedIn(st);
  // The panel style says the same thing the user wrote (or names no genre at all, e.g. "uplifting") → keep it.
  if (!panel.length || panel.some((g) => named.includes(g))) return st;
  return '';
}
