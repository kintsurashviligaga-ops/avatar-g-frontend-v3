/**
 * lib/music/producer/spec.ts — what one Music Producer request is (Phase 8.5). Pure, client-safe.
 *
 * WHAT LYRIA ON VERTEX REALLY TAKES (Google's Lyria 3 model page and prompt guide, both updated 2026-11-12):
 *   - Two models only: lyria-3-clip-preview (always 30 s) and lyria-3-pro-preview (up to 184 s). Lyria 3.5 is on the
 *     Gemini Developer API only, which the Vertex-only rule excludes.
 *   - Genre, mood, instruments, tempo (BPM), key, intensity and timed sections `[mm:ss]` are PROMPT text. There is no
 *     duration, BPM, seed or negative-prompt parameter (the model page lists negative prompting as "Not supported").
 *   - Vocals by default, "Instrumental" removes them; own lyrics after "Lyrics:", or the model writes them.
 *   - Sung languages listed: en, de, es, fr, hi, ja, ko, pt. Georgian is NOT listed (GG's 2026-10-26 paid test passed).
 *   - No extend, no edit, no inpainting, no stems, no audio input. Up to 10 reference images.
 * So every control below becomes words in the brief (brief.ts), and the UI calls a BPM a "target tempo", never exact.
 */

export type L10n = { ka: string; en: string; ru: string };
export type ProducerLang = keyof L10n;

export interface Preset { id: string; label: L10n; /** The English words Lyria reads. */ words: string }

const p = (id: string, en: string, ka: string, ru: string, words = en.toLowerCase()): Preset => ({ id, label: { en, ka, ru }, words });

export const GENRES: readonly Preset[] = [
  p('cinematic', 'Cinematic', 'კინემატოგრაფიული', 'Кинематографичный', 'cinematic orchestral score'),
  p('electronic', 'Electronic', 'ელექტრონული', 'Электроника', 'electronic'),
  p('lofi', 'Lo-Fi', 'ლო-ფაი', 'Лоу-фай', 'lo-fi hip-hop'),
  p('epic', 'Epic', 'ეპიკური', 'Эпичный', 'epic trailer music'),
  p('pop', 'Pop', 'პოპი', 'Поп', 'modern pop'),
  p('rock', 'Rock', 'როკი', 'Рок', 'rock'),
  p('hiphop', 'Hip-Hop', 'ჰიპ-ჰოპი', 'Хип-хоп', 'hip-hop'),
  p('jazz', 'Jazz', 'ჯაზი', 'Джаз', 'jazz'),
  p('classical', 'Classical', 'კლასიკური', 'Классика', 'classical'),
  p('ambient', 'Ambient', 'ემბიენტი', 'Эмбиент', 'ambient'),
  p('rnb', 'R&B', 'არ-ენ-ბი', 'R&B', 'modern R&B'),
  p('georgian-folk', 'Georgian folk', 'ქართული ხალხური', 'Грузинский фолк', 'Georgian folk with polyphonic choral harmony'),
];

export const MOODS: readonly Preset[] = [
  p('happy', 'Happy', 'მხიარული', 'Весёлый'),
  p('sad', 'Sad', 'სევდიანი', 'Грустный', 'sad, melancholic'),
  p('calm', 'Calm', 'მშვიდი', 'Спокойный', 'calm, peaceful'),
  p('energetic', 'Energetic', 'ენერგიული', 'Энергичный'),
  p('romantic', 'Romantic', 'რომანტიკული', 'Романтичный'),
  p('dark', 'Dark', 'ბნელი', 'Мрачный', 'dark, brooding'),
  p('uplifting', 'Uplifting', 'შთამაგონებელი', 'Воодушевляющий'),
  p('mysterious', 'Mysterious', 'იდუმალი', 'Загадочный'),
  p('nostalgic', 'Nostalgic', 'ნოსტალგიური', 'Ностальгичный'),
  p('tense', 'Tense', 'დაძაბული', 'Напряжённый', 'tense and suspenseful'),
];

export const INSTRUMENTS: readonly Preset[] = [
  p('piano', 'Piano', 'ფორტეპიანო', 'Фортепиано'),
  p('synth', 'Synth', 'სინთეზატორი', 'Синтезатор', 'synthesizer'),
  p('violin', 'Violin', 'ვიოლინო', 'Скрипка'),
  p('strings', 'Strings', 'სიმებიანები', 'Струнные', 'string orchestra'),
  p('guitar', 'Guitar', 'გიტარა', 'Гитара', 'electric guitar'),
  p('acoustic', 'Acoustic guitar', 'აკუსტიკური გიტარა', 'Акустическая гитара'),
  p('drums', 'Drums', 'დრამი', 'Барабаны'),
  p('bass', 'Bass', 'ბასი', 'Бас', 'bass guitar'),
  p('choir', 'Choir', 'გუნდი', 'Хор'),
  p('brass', 'Brass', 'სასულე', 'Духовые', 'brass section'),
  p('flute', 'Flute', 'ფლეიტა', 'Флейта'),
  p('panduri', 'Panduri', 'ფანდური', 'Пандури', 'Georgian panduri (three-string lute)'),
  p('duduki', 'Duduki', 'დუდუკი', 'Дудук', 'duduk'),
];

/** The lengths the panel sells. 30 = Lyria 3 Clip; 60 / 120 / 180 = Lyria 3 Pro (its cap is 184 s). */
export const PRODUCER_LENGTHS = [30, 60, 120, 180] as const;
export type ProducerLength = (typeof PRODUCER_LENGTHS)[number];
export const CLIP_SEC = 30;
export const PRO_MAX_SEC = 184;

export const BPM_MIN = 60;
export const BPM_MAX = 180;
export const MAX_INSTRUMENTS = 6;
export const MAX_MOODS = 2;
export const BRIEF_MAX = 1_000;
export const LYRICS_MAX = 1_500;
export const AVOID_MAX = 200;
export const CUSTOM_INSTRUMENT_MAX = 40;

export type ProducerVoice = 'auto' | 'female' | 'male' | 'duet';

export interface ProducerSpec {
  /** The user's own description, verbatim. May be empty when chips say enough. */
  brief: string;
  genre: string | null;
  moods: string[];
  /** Preset ids or the user's own words (≤ 40 characters each). */
  instruments: string[];
  /** Target tempo. null = the model chooses. */
  bpm: number | null;
  vocals: boolean;
  /** The user's lyrics with [Verse] / [Chorus] tags, or '' when `autoLyrics`. */
  lyrics: string;
  autoLyrics: boolean;
  voice: ProducerVoice;
  lengthSec: ProducerLength;
  /** Things to keep out ("no drums"). Sent as an "Avoid:" line: Lyria 3 has no negative-prompt field. */
  avoid: string;
}

export const DEFAULT_SPEC: ProducerSpec = {
  brief: '', genre: null, moods: [], instruments: [], bpm: null, vocals: false, lyrics: '', autoLyrics: true,
  voice: 'auto', lengthSec: 30, avoid: '',
};

export const presetOf = (list: readonly Preset[], id: string | null | undefined): Preset | null =>
  (id ? list.find((x) => x.id === id) ?? null : null);

export const modelFor = (lengthSec: number): 'clip' | 'pro' => (lengthSec <= CLIP_SEC ? 'clip' : 'pro');

export type SpecCheck = { ok: true; spec: ProducerSpec } | { ok: false; errors: string[] };

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const tidy = (v: unknown, max: number): string | null => {
  if (v == null) return '';
  if (typeof v !== 'string') return null;
  const s = v.replace(CTRL, ' ').trim();
  return s.length <= max ? s : null;
};
const LABEL = /^[\p{L}\p{N} &/'+().,-]+$/u;

/** Validate anything from the wire into a spec. Every problem is listed, nothing is silently fixed. */
export function parseProducerSpec(raw: unknown): SpecCheck {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const brief = tidy(r.brief, BRIEF_MAX);
  if (brief == null) errors.push(`brief: text up to ${BRIEF_MAX} characters`);
  const genre = r.genre == null || r.genre === '' ? null : typeof r.genre === 'string' && presetOf(GENRES, r.genre) ? r.genre : undefined;
  if (genre === undefined) errors.push('genre: one of the preset ids');
  const moods = Array.isArray(r.moods) ? r.moods : r.moods == null ? [] : null;
  if (!moods || moods.length > MAX_MOODS || moods.some((m) => typeof m !== 'string' || !presetOf(MOODS, m))) errors.push(`moods: up to ${MAX_MOODS} preset ids`);
  const instruments = Array.isArray(r.instruments) ? r.instruments : r.instruments == null ? [] : null;
  if (!instruments || instruments.length > MAX_INSTRUMENTS
    || instruments.some((i) => typeof i !== 'string' || !(presetOf(INSTRUMENTS, i) || (i.trim().length > 0 && i.length <= CUSTOM_INSTRUMENT_MAX && LABEL.test(i))))) {
    errors.push(`instruments: up to ${MAX_INSTRUMENTS}, preset ids or short names`);
  }
  const bpm = r.bpm == null ? null : typeof r.bpm === 'number' && Number.isInteger(r.bpm) && r.bpm >= BPM_MIN && r.bpm <= BPM_MAX ? r.bpm : undefined;
  if (bpm === undefined) errors.push(`bpm: a whole number ${BPM_MIN}–${BPM_MAX}, or null`);
  const vocals = r.vocals === true;
  const lyrics = tidy(r.lyrics, LYRICS_MAX);
  if (lyrics == null) errors.push(`lyrics: text up to ${LYRICS_MAX} characters`);
  const autoLyrics = r.autoLyrics !== false;
  const voice = (['auto', 'female', 'male', 'duet'] as const).find((v) => v === (r.voice ?? 'auto'));
  if (!voice) errors.push('voice: auto, female, male or duet');
  const lengthSec = PRODUCER_LENGTHS.find((l) => l === r.lengthSec);
  if (!lengthSec) errors.push(`lengthSec: one of ${PRODUCER_LENGTHS.join(', ')}`);
  const avoid = tidy(r.avoid, AVOID_MAX);
  if (avoid == null) errors.push(`avoid: text up to ${AVOID_MAX} characters`);

  if (!vocals && lyrics) errors.push('lyrics: an instrumental has no lyrics');
  if (!vocals && voice && voice !== 'auto') errors.push('voice: an instrumental has no singer');
  if (vocals && !autoLyrics && !lyrics) errors.push('lyrics: write lyrics or switch on "Write lyrics for me"');
  if (!brief && !genre && !(moods && moods.length) && !(instruments && instruments.length) && !lyrics) {
    errors.push('brief: describe the track or pick a genre, mood or instrument');
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    spec: {
      brief: brief as string, genre: genre as string | null, moods: moods as string[],
      instruments: (instruments as string[]).map((i) => i.trim()), bpm: bpm as number | null, vocals,
      lyrics: vocals ? (lyrics as string) : '', autoLyrics: vocals ? autoLyrics || !lyrics : false,
      voice: vocals ? (voice as ProducerVoice) : 'auto', lengthSec: lengthSec as ProducerLength, avoid: avoid as string,
    },
  };
}
