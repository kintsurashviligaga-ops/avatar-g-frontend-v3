/**
 * lib/audio/songPrompt.ts — what a film's song or score is asked to be: its length, genre, tempo, vocalist and language,
 * from the brief. Pure, engine-neutral text (it was part of the ElevenLabs Music client, deleted in PR 6); the engine is
 * Lyria on Vertex (lib/audio/lyriaBed).
 */

/** The longest film song composed in one request (s): the longest film the studio makes (lib/video/duration VIDEO_MAX_SEC). */
export const FILM_SONG_MAX_SEC = 240;

/**
 * How long a film's song or score is composed: the film's own length (8 s at least), so it runs under every scene. It was
 * a flat 30 s cap, and the assembler pads a short bed with silence, so anything past 30 s played with no music.
 */
export function filmSongSeconds(filmSec: number): number {
  const sec = Number.isFinite(filmSec) && filmSec > 0 ? filmSec : 30;
  return Math.min(FILM_SONG_MAX_SEC, Math.max(8, Math.round(sec)));
}

/** True when most letters of `text` are Georgian (Mkhedruli). */
export function mostlyGeorgian(text: string): boolean {
  const ka = (text.match(/[\u10D0-\u10FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return ka > 0 && ka >= latin;
}

/** The tempo each genre is usually played at (4/4), before it is fitted to the scene grid. */
const GENRE_BPM: Readonly<Record<string, number>> = {
  'R&B': 85, 'hip-hop': 90, 'folk-pop': 105, pop: 115, 'blues and jazz': 90, blues: 80, jazz: 100,
  country: 100, soul: 85, folk: 100, rock: 125, electronic: 124,
};

/**
 * The genre a brief names, in English or Georgian, or null when it names none. `text` may carry the brief and its
 * English rendering together, so a genre named in either language is found.
 */
export function songGenreFromBrief(text: string): string | null {
  const lower = (text || '').toLowerCase();
  return /\br&b\b|\brnb\b/.test(lower) ? 'R&B' :
    /hip[- ]?hop|\brap\b|ჰიპ-?ჰოპ|(?:^|[\s,.])რეპ(?!ეტ|ორტ|ერტ)/.test(lower) ? 'hip-hop' :
    /\bfolk[- ]?pop\b/.test(lower) ? 'folk-pop' :
    /\bpop\b|პოპ(?!ულ)/.test(lower) ? 'pop' :
    /\bblues\b|ბლუზ/.test(lower) && /\bjazz\b|ჯაზ/.test(lower) ? 'blues and jazz' :
    /\bblues\b|ბლუზ/.test(lower) ? 'blues' :
    /\bjazz\b|ჯაზ/.test(lower) ? 'jazz' :
    /\bcountry\b|ქანთრ/.test(lower) ? 'country' :
    /\bsoul\b|სოულ/.test(lower) ? 'soul' :
    /\bfolk\b|ფოლკ|ხალხურ/.test(lower) ? 'folk' :
    /\brock\b|როკ/.test(lower) ? 'rock' :
    /\belectronic|\bedm\b|\bsynth|ელექტრონ/.test(lower) ? 'electronic' : null;
}

/** The usual tempo of a genre from songGenreFromBrief (110 for none). */
export function genreBpm(genre: string | null): number {
  return (genre && GENRE_BPM[genre]) || 110;
}

/**
 * The tempo nearest `preferredBpm` at which ONE scene is a whole number of 4/4 bars, so every cut between scenes lands
 * on a bar line of the song instead of mid-phrase: 8 s scenes give 60 / 90 / 120 / 150 BPM (2–5 bars), 6 s scenes
 * 80 / 120 / 160. Kept within 60–180 BPM. A scene length that is not a positive number leaves the tempo as it is.
 */
export function sceneAlignedBpm(preferredBpm: number, sceneSec: number): number {
  if (!(sceneSec > 0)) return Math.round(preferredBpm);
  let best: number | null = null;
  for (let bars = 1; bars <= 16; bars += 1) {
    const bpm = (bars * 240) / sceneSec;
    if (bpm < 60 || bpm > 180) continue;
    if (best === null || Math.abs(bpm - preferredBpm) < Math.abs(best - preferredBpm)) best = bpm;
  }
  return Math.round(best ?? preferredBpm);
}

/**
 * The music engine's prompt and instrumental flag for a film brief: a music video gets a sung song (genre, vocalist,
 * lyric language, mood), a narrative film a cohesive instrumental score.
 *
 * `theme` is the brief in English (the engine reads English: a Georgian brief quoted verbatim reached it as noise, and
 * it composed from its own priors, Production 2026-10-16). The song's LANGUAGE still comes from what the user typed.
 * `sceneSec` is the length of one scene: a music video's song keeps one tempo at which every cut lands on a bar line.
 * `totalSec` is the length of the track the engine is asked for (lib/audio/lyriaBed lyriaBedPlan).
 */
export function buildSongPrompt(o: { brief: string; totalSec: number; musicVideoMode?: boolean; vocalGender?: 'male' | 'female' | 'duet'; theme?: string; sceneSec?: number }): {
  prompt: string;
  instrumental: boolean;
} {
  const brief = (o.brief || '').trim();
  const theme = (o.theme || '').trim() || brief;
  const lower = brief.toLowerCase();
  const both = `${lower}\n${theme.toLowerCase()}`;
  const isMusicVideo =
    o.musicVideoMode === true ||
    /\bmusic video\b/.test(lower) ||
    (/\bmusic\b|\bsong\b|\bbeat\b|\bvocal|\br&b\b|\brnb\b|\bpop\b|\bhip[- ]?hop\b/.test(lower) && /\bsing|\bsinger\b|\bvocal|\blyric/.test(lower)) ||
    /მუსიკალური ვიდეო|სიმღერ|მომღერ|მღერ/.test(brief);

  if (!isMusicVideo) {
    return {
      prompt:
        `Fully-instrumental cinematic film score for a ${o.totalSec}-second short film. ` +
        `Match the era, mood and intensity of: "${theme.slice(0, 400)}". Orchestral, emotional, ` +
        `with a clear dynamic arc — a quiet build that swells and resolves. No vocals, no lyrics.`,
      instrumental: true,
    };
  }

  const named = songGenreFromBrief(both);
  const genre = named ?? 'pop';
  const bpm = sceneAlignedBpm(genreBpm(named), o.sceneSec ?? 8);
  // Explicit selector wins; otherwise infer from the brief (default male tenor).
  // 'duet' → two lead vocalists (male + female) trading lines and harmonising.
  const duet = o.vocalGender === 'duet';
  const female = o.vocalGender ? o.vocalGender === 'female' : (/\bwoman\b|\bfemale\b|\bgirl\b|\bher\b|\bshe\b/.test(lower) || /ქალ|გოგო/.test(brief));
  const vocalist = duet
    ? 'a male–female duet: a powerful male tenor and a powerful female lead trading verses and harmonising on the chorus'
    : female ? 'a powerful female lead vocalist' : 'a powerful male tenor lead vocalist';
  // The song's language follows what the user WROTE: a brief typed in Georgian gets a Georgian song (Production
  // 2026-10-16: "ძველ ფაბში მღერის ბლუზს და ჯაზს" came back as an English blues track), unless it asks for English.
  const georgian = !/\benglish\b|ინგლისურ/.test(lower) && (/\bgeorgian\b/.test(lower) || /ქართ/.test(brief) || mostlyGeorgian(brief.split('\n\n')[0] ?? ''));
  const lyricLang = georgian ? 'sung in Georgian' : 'sung lyrics';
  const moody = /\bmoody\b|\bnight\b|\bneon\b|atmospheric|\bdark\b/.test(both) || /ღამ|ნეონ/.test(brief);

  return {
    prompt:
      `An original ${genre} song for a ${o.totalSec}-second music video, with ${vocalist} ${lyricLang}. ` +
      `${moody ? 'Moody, atmospheric, ' : ''}modern studio production, a catchy hook, and a clear lead vocal on top. ` +
      // ONE continuous song under the whole film: one steady tempo, no stops, so the scenes are cut onto it.
      `One continuous song for the full ${o.totalSec} seconds at a steady ${bpm} BPM in 4/4, no tempo changes and no breaks. ` +
      `Theme: "${theme.slice(0, 300)}".`,
    instrumental: false,
  };
}
