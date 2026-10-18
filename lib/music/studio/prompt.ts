/**
 * lib/music/studio/prompt.ts — the exact text Lyria receives for a plan. Pure and deterministic, so the quote can show
 * it and a test can pin it. The user's prompt and lyrics go through verbatim (no translation, no rewriting); the
 * structured choices become short English directions after them.
 */
import type { MusicPlan, MusicRequest } from './contracts';

const LANG_NAME = { ka: 'Georgian', en: 'English', ru: 'Russian' } as const;
const TEMPO = { slow: 'slow tempo', medium: 'medium tempo', fast: 'fast, upbeat tempo' } as const;
const VOCAL = { auto: '', female: 'female lead vocal', male: 'male lead vocal', duet: 'male and female duet' } as const;

export function directions(r: MusicRequest): string[] {
  const out: string[] = [];
  if (r.genre?.trim()) out.push(`Genre: ${r.genre.trim()}`);
  if (r.mood?.trim()) out.push(`Mood: ${r.mood.trim()}`);
  if (r.bpm) out.push(`Around ${r.bpm} BPM`);
  else if (r.tempo) out.push(TEMPO[r.tempo]);
  if (r.mode === 'instrumental') out.push('Instrumental only, no vocals');
  else {
    const v = VOCAL[r.vocalGender ?? 'auto'];
    if (v) out.push(v);
    if (r.lyricsLanguage) out.push(`Sung in ${LANG_NAME[r.lyricsLanguage]}`);
  }
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
