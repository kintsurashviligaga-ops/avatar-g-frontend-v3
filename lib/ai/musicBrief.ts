/**
 * Assemble the music brief — the STRUCTURED version, where the user's own words get their own budget.
 *
 * ⚠️ THE BUG THIS REPLACES: the user's lyrics were the first thing thrown away.
 *
 * Everything used to be concatenated into ONE string before it reached the engine:
 *
 *   `${prompt}. ${vocalDescriptor}. Lyrics: ${lyrics}`  →  `${that}. Style: ${style}.`  →  slice(0, 1500)
 *
 * The lyrics sit at the END of that string, so they are what the slice cuts. A user typing 1200
 * characters of lyrics on top of a 1000-character brief lost the tail of the one thing they were most
 * specific about — and lost it silently, so the track came back "wrong" with no explanation. The same
 * shape hurt every other specific instruction: a brand name, a title, an exact phrase, all competing
 * with boilerplate for the same 1500 characters.
 *
 * Worse, the correct path already existed and was dead. generateLyriaTrack takes a separate `lyrics`
 * argument, formats it with the [Verse]/[Chorus] tags the model understands, and gives it its OWN
 * budget — and no caller ever passed it.
 *
 * So: separate fields, separate budgets, and the STYLE/vocal boilerplate is trimmed before the user's
 * text is, because the user's text is the part that carries their intent. Truncation is reported rather
 * than silent, so a caller can tell them instead of letting them wonder.
 *
 * Pure — no network, no env, no provider import — so the budget arithmetic is directly testable.
 */

/** Lyria's own ceiling for the descriptive prompt. */
export const PROMPT_BUDGET = 1500;
/** Lyria's ceiling for the lyrics block, which it counts SEPARATELY from the prompt. */
export const LYRICS_BUDGET = 1500;

export interface MusicBriefInput {
  /** What the user typed in the brief box. */
  prompt: string;
  /** Genre/style chip, e.g. "Cinematic". */
  style?: string;
  /** "female vocals" / "male vocals" / "a duet" — appended only for a sung track. */
  vocalDescriptor?: string;
  /** The user's own words to be sung. */
  lyrics?: string;
  instrumental?: boolean;
}

export interface MusicBrief {
  /** The descriptive prompt, within budget. */
  prompt: string;
  /** The lyrics, kept SEPARATE so they never compete with the prompt for space. */
  lyrics?: string;
  /** True when something had to be cut — the caller should say so rather than hide it. */
  truncated: { prompt: boolean; lyrics: boolean };
}

const clean = (s: string | undefined): string => (typeof s === 'string' ? s.trim() : '');

export function buildMusicBrief(input: MusicBriefInput): MusicBrief {
  const userPrompt = clean(input.prompt);
  const style = clean(input.style);
  const vocals = clean(input.vocalDescriptor);
  const lyrics = clean(input.lyrics);

  // Boilerplate is built FIRST so we know exactly how much room it needs, and the user's own text gets
  // everything that is left. The old order did the opposite — the user's words were appended last and
  // therefore cut first.
  const suffixParts: string[] = [];
  if (style) suffixParts.push(`Style: ${style}.`);
  // A vocal descriptor on an instrumental track is a contradiction; the engine is told one thing only.
  if (vocals && !input.instrumental) suffixParts.push(`${vocals}.`);
  if (input.instrumental) suffixParts.push('Instrumental, no vocals.');
  const suffix = suffixParts.join(' ');

  // Reserve room for the suffix plus the separating space.
  const room = Math.max(0, PROMPT_BUDGET - (suffix ? suffix.length + 1 : 0));
  const keptPrompt = userPrompt.slice(0, room);
  const promptTruncated = keptPrompt.length < userPrompt.length;

  const composed = suffix ? (keptPrompt ? `${keptPrompt} ${suffix}` : suffix) : keptPrompt;

  // Lyrics are NOT folded in. They travel as their own field with their own budget, which is what makes
  // a long brief and long lyrics able to coexist instead of one eating the other.
  const keptLyrics = input.instrumental ? '' : lyrics.slice(0, LYRICS_BUDGET);
  const lyricsTruncated = keptLyrics.length < (input.instrumental ? 0 : lyrics.length);

  return {
    prompt: composed,
    ...(keptLyrics ? { lyrics: keptLyrics } : {}),
    truncated: { prompt: promptTruncated, lyrics: lyricsTruncated },
  };
}

/**
 * The single-string form, for engines that accept only one field (Udio, ElevenLabs Music, MusicGen).
 *
 * Even here the ORDER matters: the user's brief and lyrics come before the style boilerplate, so if
 * anything is cut it is the generic part rather than the specific part. That is the opposite of what
 * the old concatenation did.
 */
export function flattenMusicBrief(brief: MusicBrief, budget = PROMPT_BUDGET): string {
  if (!brief.lyrics) return brief.prompt.slice(0, budget);
  const lyricsBlock = `\n\nLyrics:\n${brief.lyrics}`;
  // Keep ALL the lyrics if they fit; otherwise trim the descriptive half first.
  if (brief.prompt.length + lyricsBlock.length <= budget) return brief.prompt + lyricsBlock;
  const room = Math.max(0, budget - lyricsBlock.length);
  return (room > 0 ? brief.prompt.slice(0, room) : '') + lyricsBlock.slice(0, budget);
}
