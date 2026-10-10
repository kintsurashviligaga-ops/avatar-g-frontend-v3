/**
 * lib/agent/params.ts — the parameters a user puts in words, read the same way by the chat (lib/agent/intent) and by the
 * server that prices the job (lib/agent/media/montageExec). Pure, ka · en · ru, no network.
 *
 * ONE READER, TWO ENDS. The montage card is priced on the server from the user's words; the chat decides from the same
 * words whether a message changes a plan that is already on screen. If they read „მუსიკა 5 წამიდან დაიწყე" differently,
 * the card would say one thing and the edit do another. So both import these functions.
 *
 * ⚠️ NO `\b` (ASCII-only; it never matches next to a Georgian or Cyrillic letter). Token edges are Unicode lookarounds.
 */
import { mineDurationSec, mineTargetLanguage } from '@/lib/chat/studioIntent';
import { aspectFromPrompt } from '@/lib/agent/media/montageAsk';
import type { IntentParams } from './contracts';

const B0 = '(?<![\\p{L}\\p{N}])';
const B1 = '(?![\\p{L}\\p{N}])';

/** The words for music, in the three languages: a start offset is about the track only when the track is named. */
const MUSIC = /მუსიკ|სიმღერ|ტრეკ|ბიტ|music|song|track|audio|soundtrack|музык|песн|трек|аудио/iu;

/** „0:05" → 5, „1:30" → 90. */
const clock = (m: string, s: string): number => parseInt(m, 10) * 60 + parseInt(s, 10);

const NUM = '(\\d{1,4}(?:[.,]\\d{1,2})?)';
const START_PATTERNS: ReadonlyArray<{ re: RegExp; read: (m: RegExpExecArray) => number }> = [
  // „5 წამიდან", „5-წამიდან", „მე-5 წამიდან", „5 წმ-დან"
  { re: new RegExp(`(?:მე-?)?${NUM}\\s*-?\\s*(?:წამიდან|წმ\\.?\\s*-?\\s*დან|სეკუნდიდან)${B1}`, 'iu'), read: (m) => parseFloat(m[1]!.replace(',', '.')) },
  // „0:05-დან"
  { re: new RegExp(`(\\d{1,2}):(\\d{2})\\s*-?\\s*დან${B1}`, 'iu'), read: (m) => clock(m[1]!, m[2]!) },
  // "from 5 s", "at 5 seconds", "starting at 0:05", "from the 5th second"
  { re: new RegExp(`${B0}(?:from|at|starting\\s+(?:at|from))\\s+(?:the\\s+)?(\\d{1,2}):(\\d{2})${B1}`, 'iu'), read: (m) => clock(m[1]!, m[2]!) },
  { re: new RegExp(`${B0}(?:from|at|starting\\s+(?:at|from))\\s+(?:the\\s+)?${NUM}(?:st|nd|rd|th)?\\s*-?\\s*(?:s|sec|secs|second|seconds)${B1}`, 'iu'), read: (m) => parseFloat(m[1]!.replace(',', '.')) },
  // „с 5 секунды", „с 5-й секунды", „с 0:05"
  { re: new RegExp(`${B0}(?:с|со|начиная\\s+с)\\s+(\\d{1,2}):(\\d{2})${B1}`, 'iu'), read: (m) => clock(m[1]!, m[2]!) },
  { re: new RegExp(`${B0}(?:с|со|начиная\\s+с)\\s+${NUM}\\s*-?\\s*(?:й|ой|ей)?\\s*(?:секунд\\p{L}*|сек\\p{L}*)`, 'iu'), read: (m) => parseFloat(m[1]!.replace(',', '.')) },
];

/** The longest track offset anyone needs (an hour) — a pasted number is never a three-day seek. */
const MAX_START_SEC = 3600;

/** Where in the music the edit should start, when the user said so and named the music; with the phrase it came from. */
export function mineMusicStart(text: string): { sec: number; phrase: string } | null {
  const t = String(text ?? '');
  if (!MUSIC.test(t)) return null;
  for (const { re, read } of START_PATTERNS) {
    const m = re.exec(t);
    if (!m) continue;
    const sec = read(m);
    if (Number.isFinite(sec) && sec >= 0) return { sec: Math.min(MAX_START_SEC, Math.round(sec * 100) / 100), phrase: m[0] };
  }
  return null;
}

export const mineMusicStartSec = (text: string): number | undefined => mineMusicStart(text)?.sec;

/** „each shot 2 seconds", „თითო კადრი 2 წამი", „каждый кадр 2 секунды": a shot length, not the length of the edit. */
const PER_SHOT = new RegExp(`${B0}(?:each|every|per|თითო|ყოველი|каждый|каждая|каждое|по)${B1}`, 'iu');

/**
 * The length of the whole result, when the user named one. A music start („5 წამიდან") is not a length, and a per-shot
 * length is not the length of the edit: both are taken out before the length is read.
 */
export function mineTotalDurationSec(text: string): number | undefined {
  let t = String(text ?? '');
  // Every start phrase, not only the first: a changed plan can carry two („from 3 seconds" … „5 წამიდან").
  for (let k = 0; k < 6; k += 1) {
    const start = mineMusicStart(t);
    if (!start) break;
    t = t.replace(start.phrase, ' ');
  }
  if (PER_SHOT.test(t)) return undefined;
  return mineDurationSec(t);
}

/** Every parameter the words carry. Only what was said is set. */
export function mineParams(text: string): IntentParams {
  const t = String(text ?? '');
  const out: IntentParams = {};
  const aspect = aspectFromPrompt(t);
  if (aspect) out.aspect = aspect;
  const start = mineMusicStartSec(t);
  if (start !== undefined) out.musicStartSec = start;
  const dur = mineTotalDurationSec(t);
  if (dur !== undefined) out.durationSec = dur;
  const lang = mineTargetLanguage(t);
  if (lang) out.targetLanguage = lang;
  return out;
}

export type PlanParams = Pick<IntentParams, 'aspect' | 'durationSec' | 'musicStartSec'>;

/**
 * The plan parameters of a montage prompt, where a LATER line wins. A plan changed in the chat („მუსიკა 5 წამიდან
 * დაიწყე" under the card) is re-quoted from its own words with the change on a new line (lib/agent/intentReply
 * mergeMontagePrompt): „16:9 … \n 9:16" must come out 9:16, and „20 seconds … \n make it 30" 30. The whole text is read
 * first, so a phrase broken over two lines still counts; each line then overrides what it names. One line: mineParams.
 */
export function minePlanParams(text: string): PlanParams {
  const t = String(text ?? '');
  const pick = (p: IntentParams): PlanParams => ({
    ...(p.aspect !== undefined ? { aspect: p.aspect } : {}),
    ...(p.durationSec !== undefined ? { durationSec: p.durationSec } : {}),
    ...(p.musicStartSec !== undefined ? { musicStartSec: p.musicStartSec } : {}),
  });
  let out = pick(mineParams(t));
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length > 1) for (const line of lines) out = { ...out, ...pick(mineParams(line)) };
  return out;
}

/** Does this message carry a parameter a plan on screen could take (frame shape, length, music start)? */
export function hasPlanParams(p: IntentParams): boolean {
  return p.aspect !== undefined || p.durationSec !== undefined || p.musicStartSec !== undefined;
}
