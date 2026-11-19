/**
 * lib/music/studio/prompt.ts — the exact text Lyria receives for a plan. Pure and deterministic, so the quote can show
 * it and a test can pin it. The user's prompt and lyrics go through verbatim (no translation, no rewriting); the
 * structured choices become short English directions after them.
 */
import { musicLengthDirection } from '@/lib/studio/musicEngines';
import type { MusicPlan, MusicRequest } from './contracts';
import { styleForBrief } from '@/lib/ai/musicGenreWords';
import { songDirections, songLanguageOf } from '@/lib/ai/musicVocals';

const LANG_NAME = { ka: 'Georgian', en: 'English', ru: 'Russian' } as const;
const TEMPO = { slow: 'slow tempo', medium: 'medium tempo', fast: 'fast, upbeat tempo' } as const;
const VOCAL = { auto: '', female: 'female lead vocal', male: 'male lead vocal', duet: 'male and female duet' } as const;

export function directions(r: MusicRequest): string[] {
  const out: string[] = [];
  // The user's own words win: a genre chip their prompt contradicts is left out (lib/ai/musicGenreWords).
  const genre = styleForBrief(r.genre, r.prompt);
  if (genre) out.push(`Genre: ${genre}`);
  if (r.mood?.trim()) out.push(`Mood: ${r.mood.trim()}`);
  if (r.bpm) out.push(`Around ${r.bpm} BPM`);
  else if (r.tempo) out.push(TEMPO[r.tempo]);
  if (r.mode === 'instrumental') out.push('Instrumental only, no vocals');
  else {
    const v = VOCAL[r.vocalGender ?? 'auto'];
    if (v) out.push(v);
    if (r.lyricsLanguage) out.push(`Sung in ${LANG_NAME[r.lyricsLanguage]}`);
    // Lead vocal, written-or-given lyrics, structure (lib/ai/musicVocals). The language is the picked one above, else
    // the script the person wrote in; the prompt here is verbatim, so a language it names is left to it.
    out.push(...songDirections({
      instrumental: false,
      hasLyrics: !!r.lyrics?.trim(),
      language: r.lyricsLanguage ? null : songLanguageOf(r.lyrics, r.prompt),
      targetSec: r.durationSec,
    }));
  }
  // Lyria 3 Pro has no length field: a track over 30 s is steered to its length here (empty for the clip's 30 s).
  const length = musicLengthDirection(r.durationSec);
  if (length) out.push(length);
  return out;
}

export function lyriaInput(plan: MusicPlan): string {
  const r = plan.request;
  const head = r.prompt.trim();
  const dirs = directions(r);
  let input = dirs.length ? `${head}\n\n${dirs.join('. ')}.` : head;
  if (r.mode === 'song' && r.lyrics?.trim()) input += `\n\nLyrics:\n${r.lyrics.trim()}`;
  return input;
}
