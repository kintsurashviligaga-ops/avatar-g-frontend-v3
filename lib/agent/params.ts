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
import { aspectFromPrompt, withoutTransitionLength } from '@/lib/agent/media/montageAsk';
import type { IntentParams } from './contracts';

const B0 = '(?<![\\p{L}\\p{N}])';
const B1 = '(?![\\p{L}\\p{N}])';

/** The words for music, in the three languages: a start offset is about the track only when the track is named. */
const MUSIC = /მუსიკ|სიმღერ|ტრეკ|ბიტ|music|song|track|audio|soundtrack|музык|песн|трек|аудио/iu;

/** „0:05" → 5, „1:30" → 90. */
const clock = (m: string, s: string): number => parseInt(m, 10) * 60 + parseInt(s, 10);

/**
 * A number of seconds as typed. ⚠️ „0.58" WITH TWO DIGITS AFTER THE POINT (00–59) IS A CLOCK, 0:58: a phone keyboard
 * has no colon on its number row, so a time in a song is typed „0.58" or „1,30" (the owner, 2026-10-11: „სიმღერა
 * ზუსტად 0.58 წამიდან დაადე" meant 0:58 and got the song from 0:01). Nobody starts a song 0.58 s in. One digit after
 * the point („1.5 წამიდან") and a fraction past 59 („2.75") stay seconds.
 */
const seconds = (raw: string): number => {
  const mmss = /^(\d{1,2})[.,]([0-5]\d)$/.exec(raw);
  return mmss ? clock(mmss[1]!, mmss[2]!) : parseFloat(raw.replace(',', '.'));
};

const NUM = '(\\d{1,4}(?:[.,]\\d{1,2})?)';
const START_PATTERNS: ReadonlyArray<{ re: RegExp; read: (m: RegExpExecArray) => number }> = [
  // „5 წამიდან", „5-წამიდან", „მე-5 წამიდან", „58-ე წამიდან" (the owner's Media Studio v2.0 sentence), „5 წმ-დან",
  // „0.58 წამიდან" (0:58)
  { re: new RegExp(`(?:მე-?)?${NUM}(?:\\s*-?\\s*ე)?\\s*-?\\s*(?:წამიდან|წმ\\.?\\s*-?\\s*დან|სეკუნდიდან)${B1}`, 'iu'), read: (m) => seconds(m[1]!) },
  // „0:05-დან", „0.58-დან", „1,30-დან", and with a noun between (Video Core v1.0 §4.2, the owner's „სიმღერა დაიწყე მისი
  // 0:58 პოზიციიდან"): „0:58 პოზიციიდან", „1:05 ნიშნულიდან", „0:58 მომენტიდან", „0:58 წამიდან"
  { re: new RegExp(`(\\d{1,2})[:.,]([0-5]\\d)\\s*-?\\s*(?:(?:პოზიცი|ნიშნულ|მომენტ|წამ|წუთ)\\p{L}*)?დან${B1}`, 'iu'), read: (m) => clock(m[1]!, m[2]!) },
  // „0:58-ზე დაიწყე", „0:58 წამზე დაიწყოს": the clock the song is started AT
  { re: new RegExp(`(\\d{1,2})[:.,]([0-5]\\d)(?:\\s*-?\\s*(?:წამ|წუთ)\\p{L}*)?\\s*-?\\s*ზე\\s+(?:დაიწყ|დაწყ|დაადე|ჩართ|ააწყ)`, 'iu'), read: (m) => clock(m[1]!, m[2]!) },
  // "from 5 s", "at 5 seconds", "starting at 0:05", "from the 5th second", "from the 0:58 mark", "from position 0:58"
  { re: new RegExp(`${B0}(?:from|at|starting\\s+(?:at|from))\\s+(?:the\\s+)?(?:(?:position|mark|point|timestamp)\\s+(?:of\\s+)?)?(\\d{1,2}):(\\d{2})${B1}`, 'iu'), read: (m) => clock(m[1]!, m[2]!) },
  { re: new RegExp(`${B0}(?:from|at|starting\\s+(?:at|from))\\s+(?:the\\s+)?${NUM}(?:st|nd|rd|th)?\\s*-?\\s*(?:s|sec|secs|second|seconds)${B1}`, 'iu'), read: (m) => seconds(m[1]!) },
  // "at second 58", "from second 58", "starting at sec 58", "at the 58-second mark" (Video Core round 3: the brief's EN
  // sentence "Start the music at second 58." fell to the chat model while its KA/RU twins were understood)
  { re: new RegExp(`${B0}(?:from|at|starting\\s+(?:at|from))\\s+(?:the\\s+)?(?:second|sec)\\s+${NUM}${B1}`, 'iu'), read: (m) => seconds(m[1]!) },
  { re: new RegExp(`${B0}(?:from|at|starting\\s+(?:at|from))\\s+the\\s+${NUM}\\s*-?\\s*(?:s|sec|second)\\s+mark${B1}`, 'iu'), read: (m) => seconds(m[1]!) },
  // „с 5 секунды", „с 5-й секунды", „с 0:05", «с позиции 0:58», «с отметки 1:05»
  { re: new RegExp(`${B0}(?:с|со|начиная\\s+с)\\s+(?:(?:позиции|отметки|момента|места)\\s+)?(\\d{1,2}):(\\d{2})${B1}`, 'iu'), read: (m) => clock(m[1]!, m[2]!) },
  { re: new RegExp(`${B0}(?:с|со|начиная\\s+с)\\s+${NUM}\\s*-?\\s*(?:й|ой|ей)?\\s*(?:секунд\\p{L}*|сек\\p{L}*)`, 'iu'), read: (m) => seconds(m[1]!) },
  // Seconds said to be the TRACK's own (review 2026-10-13, with lib/agent/media/montageAsk asksMusicDelay): "30 seconds
  // into the song", "after 30 seconds of the song", „სიმღერის 30 წამის შემდეგ", «после 30 секунд песни»
  { re: new RegExp(`${B0}${NUM}\\s*-?\\s*(?:s|secs?|seconds?)\\s+(?:into|in)\\s+(?:the|this|my)\\s+(?:song|track|music|soundtrack|audio)${B1}`, 'iu'), read: (m) => seconds(m[1]!) },
  { re: new RegExp(`${B0}after\\s+(?:the\\s+first\\s+)?${NUM}\\s*-?\\s*(?:s|secs?|seconds?)\\s+of\\s+(?:the|this|my)\\s+(?:song|track|music|soundtrack|audio)${B1}`, 'iu'), read: (m) => seconds(m[1]!) },
  { re: new RegExp(`(?:სიმღერ|ტრეკ|მუსიკ|საუნდტრეკ)\\p{L}*\\s+(?:მე-?)?${NUM}(?:\\s*-?\\s*ე)?\\s*-?\\s*წამის\\s+(?:შემდეგ|მერე)`, 'iu'), read: (m) => seconds(m[1]!) },
  { re: new RegExp(`${B0}после\\s+(?:первых\\s+)?${NUM}\\s*-?\\s*(?:секунд\\p{L}*|сек\\p{L}*)\\s+(?:песни|трека|музыки|саундтрека)(?!\\p{L})`, 'iu'), read: (m) => seconds(m[1]!) },
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

/** A time as typed: „0:05", „5", „7.5". */
const T = '(?:\\d{1,2}:\\d{2}|\\d{1,4}(?:[.,]\\d{1,2})?)';
const UNIT = `(?:s|secs?|seconds?|წმ\\.?|წამ\\p{L}*|сек\\p{L}*|с)${B1}`;
/**
 * Where in the result something happens, never how long the result is: „ბოლო 5 წამში დაწერე …", "in the first 3 s",
 * „2-დან 5 წამამდე", "from 2 to 5 s", «с 2 до 5 секунды», „3 წამის შემდეგ", "after 3 s", «через 3 секунды». "Between 20
 * and 30 seconds" and «от 20 до 30 секунд» stay: those name a length.
 */
const TIME_WINDOWS: ReadonlyArray<RegExp> = [
  new RegExp(`${B0}(?:ბოლო|პირველ\\p{L}*|last|final|first|opening|последн\\p{L}*|первы\\p{L}*)\\s+${T}\\s*-?\\s*${UNIT}`, 'giu'),
  new RegExp(`${T}\\s*-?\\s*(?:წამიდან|წმ\\.?\\s*-?\\s*დან|დან)\\s+${T}\\s*-?\\s*(?:წამამდე|წმ\\.?\\s*-?\\s*მდე|მდე)${B1}`, 'giu'),
  new RegExp(`${B0}from\\s+(?:the\\s+)?${T}\\s*(?:${UNIT})?\\s*(?:to|and|until|till|-|–|—)\\s*(?:the\\s+)?${T}\\s*(?:${UNIT})?`, 'giu'),
  new RegExp(`${B0}(?:с|со)\\s+${T}\\s*(?:-?\\s*(?:й|ой|ей)\\s*)?(?:${UNIT})?\\s*(?:до|по)\\s+${T}\\s*(?:${UNIT})?`, 'giu'),
  new RegExp(`${T}\\s*-?\\s*(?:წამის|წმ\\.?)\\s+(?:შემდეგ|მერე|გასვლისას)${B1}`, 'giu'),
  new RegExp(`${B0}(?:after|через)\\s+${T}\\s*-?\\s*${UNIT}`, 'giu'),
];

/** The text with every time window blanked, so a window's numbers are never read as the result's length. */
export function withoutTimeWindows(text: string): string {
  return TIME_WINDOWS.reduce((t, re) => t.replace(re, ' '), String(text ?? ''));
}

/**
 * The length of the whole result, when the user named one. A music start („5 წამიდან") is not a length, a per-shot
 * length is not the length of the edit, a transition's is not („0.4 წამიანი გადასვლები"), and neither is a window
 * („ბოლო 5 წამში დაწერე …"): all are taken out before the length is read.
 */
export function mineTotalDurationSec(text: string): number | undefined {
  let t = withoutTimeWindows(withoutTransitionLength(String(text ?? '')));
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
