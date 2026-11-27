/**
 * lib/music/producer/brief.ts — the exact text Lyria receives for a Producer spec. Pure and deterministic, so the quote can
 * show it and a test can pin it.
 *
 * Built in Google's documented order ([Genre & style] + [Mood] + [Instrumentation] + [Tempo & rhythm] + [Vocal style &
 * language] + [Lyrics], Lyria prompt guide), then:
 *   - a Pro track gets its length and timed sections (`[0:00 - 0:12] Intro. Intensity: 3/10`), which Lyria 3 Pro follows;
 *     the clip model gets none (it does not take timestamps; it always makes 30 s);
 *   - "Avoid: …" for what the user wants kept out (no negative-prompt field exists on Lyria 3, so it is a request);
 *   - lyrics travel after "Lyrics:" in their own budget (lib/ai/musicBrief: the user's words are never the part cut).
 * The user's own description goes through verbatim, first.
 */
import { songDirections, songLanguageOf } from '@/lib/ai/musicVocals';
import { GENRES, INSTRUMENTS, MOODS, PRO_MAX_SEC, modelFor, presetOf, type ProducerSpec } from './spec';
import { mmss, planTimeline, timelineLines, type Section } from './timeline';

export const LYRIA_CLIP = 'lyria-3-clip-preview';
export const LYRIA_PRO = 'lyria-3-pro-preview';
export const PROMPT_BUDGET = 1_500;
export const LYRICS_BUDGET = 1_500;

const VOICE = { auto: '', female: 'Female lead vocal', male: 'Male lead vocal', duet: 'A male and female vocal duet' } as const;

export interface ProducerBrief {
  model: typeof LYRIA_CLIP | typeof LYRIA_PRO;
  /** The section plan asked for (Pro) or expected (Clip). The lyric sync places lines in it. */
  timeline: Section[];
  prompt: string;
  lyrics: string;
  /** prompt + "\n\nLyrics:\n" + lyrics: the one string sent. */
  input: string;
  /** Timed sections were dropped to fit the budget. */
  sectionsDropped: boolean;
}

const sentence = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '') + '.';
const words = (list: readonly { words: string }[]) => list.map((x) => x.words).join(', ');

export function instrumentWords(ids: readonly string[]): string {
  return ids.map((i) => presetOf(INSTRUMENTS, i)?.words ?? i).join(', ');
}

export function buildProducerBrief(spec: ProducerSpec): ProducerBrief {
  const model = modelFor(spec.lengthSec) === 'clip' ? LYRIA_CLIP : LYRIA_PRO;
  const lengthSec = Math.min(spec.lengthSec, PRO_MAX_SEC);
  const timeline = planTimeline(lengthSec, spec.vocals);
  const parts: string[] = [];
  if (spec.brief.trim()) parts.push(sentence(spec.brief));
  const genre = presetOf(GENRES, spec.genre);
  if (genre) parts.push(sentence(`Genre: ${genre.words}`));
  const moods = spec.moods.map((m) => presetOf(MOODS, m)).filter((m): m is NonNullable<typeof m> => !!m);
  if (moods.length) parts.push(sentence(`Mood: ${words(moods)}`));
  if (spec.instruments.length) parts.push(sentence(`Instrumentation: ${instrumentWords(spec.instruments)}`));
  if (spec.bpm) parts.push(sentence(`Tempo: ${spec.bpm} BPM`));
  if (spec.vocals) {
    if (VOICE[spec.voice]) parts.push(sentence(VOICE[spec.voice]));
    for (const d of songDirections({
      instrumental: false,
      hasLyrics: !!spec.lyrics.trim(),
      language: songLanguageOf(spec.lyrics, spec.brief),
      briefEn: spec.brief,
      targetSec: lengthSec,
    })) parts.push(sentence(d));
  } else {
    parts.push('Instrumental, no vocals.');
  }
  if (spec.avoid.trim()) parts.push(sentence(`Avoid: ${spec.avoid}`));

  let prompt = parts.join(' ');
  let sectionsDropped = false;
  if (model === LYRIA_PRO) {
    const head = `Create a ${mmss(lengthSec)}-long track.`;
    const timed = `${head} ${prompt}\n\n${timelineLines(timeline).join('\n')}`;
    if (timed.length <= PROMPT_BUDGET) prompt = timed;
    else { prompt = `${head} ${prompt}`; sectionsDropped = true; }
  }
  prompt = prompt.slice(0, PROMPT_BUDGET);
  const lyrics = spec.vocals ? spec.lyrics.trim().slice(0, LYRICS_BUDGET) : '';
  return { model, timeline, prompt, lyrics, input: lyrics ? `${prompt}\n\nLyrics:\n${lyrics}` : prompt, sectionsDropped };
}

/** The one-line summary above Send: "Sad · Piano, Strings · 70 BPM · Instrumental · 1 min". */
export function specSummary(spec: ProducerSpec, lang: 'ka' | 'en' | 'ru' = 'en'): string {
  const out: string[] = [];
  const g = presetOf(GENRES, spec.genre);
  if (g) out.push(g.label[lang]);
  const m = spec.moods.map((id) => presetOf(MOODS, id)?.label[lang]).filter(Boolean);
  if (m.length) out.push(m.join(', '));
  if (spec.instruments.length) out.push(spec.instruments.map((i) => presetOf(INSTRUMENTS, i)?.label[lang] ?? i).join(', '));
  if (spec.bpm) out.push(`${spec.bpm} BPM`);
  const V = { ka: { on: 'ვოკალით', off: 'ინსტრუმენტული' }, en: { on: 'Vocals', off: 'Instrumental' }, ru: { on: 'С вокалом', off: 'Инструментал' } }[lang];
  out.push(spec.vocals ? V.on : V.off);
  const LEN = { ka: { 30: '30 წმ', 60: '1 წთ', 120: '2 წთ', 180: 'სრული სიმღერა' }, en: { 30: '30 s', 60: '1 min', 120: '2 min', 180: 'Full song' }, ru: { 30: '30 с', 60: '1 мин', 120: '2 мин', 180: 'Полная песня' } }[lang];
  out.push(LEN[spec.lengthSec]);
  return out.join(' · ');
}
