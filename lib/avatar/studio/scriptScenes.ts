/**
 * lib/avatar/studio/scriptScenes.ts — split a long presenter script into scenes of about 30 s. Pure, client-safe.
 *
 * RULES (Phase 8.6, GG 2026-11-15 "a 2-minute script → e.g. 4 scenes of 30 seconds"):
 *  - A scene aims for TARGET_SEC (30 s) and never runs past MAX_SEC (40 s: Omni extends to 40 s in one chain, and a
 *    Live take we cap there so a failed take costs little). The number of scenes is the smallest that keeps every
 *    scene under the cap, then the text is spread EVENLY across them (4 × 30 s, not 3 × 38 s + 1 × 6 s).
 *  - Boundaries fall between sentences; a paragraph break is a preferred cut. A sentence is cut only when it alone is
 *    longer than the cap — first at a clause mark (, ; : —), then between words.
 *  - Stage directions in (…) or *…* are never spoken (the 2026-10-16 production lesson in lib/avatar/scriptSplit): they
 *    leave the text and ride on the scene as `direction`.
 *  - Length is ESTIMATED from characters per second by language and pace. Georgian words are long (agglutinative), so
 *    Georgian is counted by characters, never by words. The real length is measured when the scene comes back.
 */
import { PACE_FACTOR, type Pace } from './catalog';

export const TARGET_SEC = 30;
export const MAX_SEC = 40;
/** The Director's Workflow cap is 10 scenes; a presentation keeps the same ceiling (≈ 5 minutes at 30 s). */
export const MAX_SCENES = 10;
/** About 2.5 minutes of Georgian at a natural pace; longer scripts are refused with a clear message, never truncated. */
export const MAX_SCRIPT_CHARS = 3_000;
/** A scene shorter than this is merged into its neighbour when that keeps both under the cap. */
export const MIN_SCENE_SEC = 6;

export type ScriptLang = 'ka' | 'en' | 'ru';

/**
 * Spoken characters per second at a natural presenting pace (letters, digits and spaces; punctuation excluded).
 * ⚠️ ESTIMATED — Georgian 14/s is from our Omni and Live Georgian clips (≈ 140 characters in a 10 s Omni take,
 * 2026-10-25); English and Russian from typical presenter rates (~150 wpm). The scene's real duration always wins.
 */
export const CHARS_PER_SEC: Record<ScriptLang, number> = { ka: 14, en: 15, ru: 14 };

const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿ]/u;
const CYRILLIC = /[Ѐ-ӿ]/u;

/** The language most of the letters are in (Georgian wins a tie: this is a Georgian product). */
export function scriptLang(text: string): ScriptLang {
  let ka = 0, ru = 0, en = 0;
  for (const ch of text) {
    if (GEORGIAN.test(ch)) ka++;
    else if (CYRILLIC.test(ch)) ru++;
    else if (/[A-Za-z]/.test(ch)) en++;
  }
  if (ka >= ru && ka >= en && ka > 0) return 'ka';
  return ru > en ? 'ru' : 'en';
}

const spokenChars = (s: string): number => s.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim().length;

/** Estimated seconds to say `text`. A pause of 0.35 s is added per sentence end (presenters breathe). */
export function estimateSeconds(text: string, pace: Pace = 'natural', lang: ScriptLang = scriptLang(text)): number {
  const chars = spokenChars(text);
  if (chars === 0) return 0;
  const stops = (text.match(/[.!?…।]+(?=\s|$)/gu) ?? []).length;
  const sec = chars / (CHARS_PER_SEC[lang] * PACE_FACTOR[pace]) + stops * 0.35;
  return Math.round(sec * 10) / 10;
}

// ── Directions ─────────────────────────────────────────────────────────────────────────────────────────────

const DIRECTION = /\(([^()]{2,})\)|\*([^*]{2,})\*/gu;

export function extractDirections(text: string): { speech: string; directions: string[] } {
  const directions: string[] = [];
  const speech = text.replace(DIRECTION, (_m, a: string | undefined, b: string | undefined) => {
    directions.push((a ?? b ?? '').trim());
    return ' ';
  });
  return { speech: speech.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(), directions };
}

// ── Sentences ──────────────────────────────────────────────────────────────────────────────────────────────

export interface Unit {
  text: string;
  /** Directions that stood inside this unit. */
  directions: string[];
  /** A paragraph break follows this unit. */
  paraEnd: boolean;
  sec: number;
}

/** Sentence ends: . ! ? … followed by space/end, not inside a number („1.5") and not after a single initial („ა. ბ."). */
const SENTENCE_END = /(?<=[.!?…]["»”’)]?)\s+(?=\S)/u;

export function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean)
    .reduce<string[]>((acc, s) => {
      // Re-join an abbreviation split: a previous piece that ends in one letter + '.' (an initial).
      const prev = acc[acc.length - 1];
      if (prev && /(?:^|\s)\p{L}\.$/u.test(prev)) acc[acc.length - 1] = `${prev} ${s}`;
      else acc.push(s);
      return acc;
    }, []);
}

/** Cut one over-long sentence into pieces each ≤ maxSec: at clause marks first, then between words. */
export function cutLongSentence(sentence: string, maxSec: number, pace: Pace, lang: ScriptLang): string[] {
  if (estimateSeconds(sentence, pace, lang) <= maxSec) return [sentence];
  const clauses = sentence.split(/(?<=[,;:—–])\s+/u).filter(Boolean);
  const pieces = clauses.length > 1 ? packGreedy(clauses, maxSec, pace, lang) : [sentence];
  return pieces.flatMap((p) => (estimateSeconds(p, pace, lang) <= maxSec ? [p] : packGreedy(p.split(/\s+/u), maxSec, pace, lang)));
}

function packGreedy(parts: string[], maxSec: number, pace: Pace, lang: ScriptLang): string[] {
  const out: string[] = [];
  let cur = '';
  for (const part of parts) {
    const next = cur ? `${cur} ${part}` : part;
    if (cur && estimateSeconds(next, pace, lang) > maxSec) {
      out.push(cur);
      cur = part;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

export function scriptUnits(script: string, pace: Pace = 'natural', maxSec = MAX_SEC): Unit[] {
  const lang = scriptLang(script);
  const paragraphs = script.replace(/\r\n?/g, '\n').split(/\n\s*\n|\n/u).map((p) => p.trim()).filter(Boolean);
  const units: Unit[] = [];
  for (const para of paragraphs) {
    const sentences = splitSentences(para);
    sentences.forEach((raw, i) => {
      const { speech, directions } = extractDirections(raw);
      const pieces = speech ? cutLongSentence(speech, maxSec, pace, lang) : [];
      if (pieces.length === 0 && directions.length && units.length) {
        units[units.length - 1]!.directions.push(...directions);
        return;
      }
      pieces.forEach((text, j) => {
        units.push({
          text,
          directions: j === 0 ? directions : [],
          paraEnd: i === sentences.length - 1 && j === pieces.length - 1,
          sec: estimateSeconds(text, pace, lang),
        });
      });
    });
  }
  return units;
}

// ── Scenes ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface ScriptScene {
  index: number;
  /** The words the presenter says, verbatim (directions removed). */
  text: string;
  direction: string;
  estSec: number;
}

export type SplitResult =
  | { ok: true; lang: ScriptLang; scenes: ScriptScene[]; totalSec: number }
  | { ok: false; reason: 'empty' | 'too_long' | 'too_many_scenes'; detail: string };

export interface SplitOptions {
  pace?: Pace;
  targetSec?: number;
  maxSec?: number;
  maxScenes?: number;
}

/**
 * Pack units into `n` scenes with the smallest largest-scene, keeping order. Linear partition by DP over prefix sums:
 * O(n · units²), at most 10 × ~120² — trivial. Ties prefer a cut at a paragraph end.
 */
function partition(units: readonly Unit[], n: number): number[][] {
  const m = units.length;
  const pre = [0];
  for (const u of units) pre.push(pre[pre.length - 1]! + u.sec);
  const cost = (i: number, j: number) => pre[j]! - pre[i]!;
  // best[k][j]: minimal max-scene length splitting units[0..j) into k scenes.
  const best: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  best[0]![0] = 0;
  for (let k = 1; k <= n; k++) {
    for (let j = k; j <= m; j++) {
      for (let i = k - 1; i < j; i++) {
        const v = Math.max(best[k - 1]![i]!, cost(i, j));
        const para = i > 0 && units[i - 1]!.paraEnd;
        const cur = best[k]![j]!;
        const prev = cut[k]![j]!;
        const prevPara = prev > 0 && units[prev - 1]!.paraEnd;
        // Strictly better wins; within 1.5 s of the best, a paragraph boundary beats a mid-paragraph cut.
        if (v < cur - 1e-9 || (para && !prevPara && v <= cur + 1.5 && v <= MAX_SEC)) {
          best[k]![j] = v;
          cut[k]![j] = i;
        }
      }
    }
  }
  const groups: number[][] = [];
  let j = m;
  for (let k = n; k >= 1; k--) {
    const i = cut[k]![j]!;
    groups.unshift(Array.from({ length: j - i }, (_, x) => i + x));
    j = i;
  }
  return groups;
}

export function splitScript(script: string, opts: SplitOptions = {}): SplitResult {
  const pace = opts.pace ?? 'natural';
  const target = opts.targetSec ?? TARGET_SEC;
  const max = opts.maxSec ?? MAX_SEC;
  const maxScenes = opts.maxScenes ?? MAX_SCENES;
  const text = (script ?? '').trim();
  if (!text || !extractDirections(text).speech) return { ok: false, reason: 'empty', detail: 'the script has no words to say' };
  if (text.length > MAX_SCRIPT_CHARS) return { ok: false, reason: 'too_long', detail: `the script is ${text.length} characters; the limit is ${MAX_SCRIPT_CHARS}` };
  const lang = scriptLang(text);
  const units = scriptUnits(text, pace, max);
  const total = units.reduce((s, u) => s + u.sec, 0);
  // Smallest n that the target suggests, raised until no scene passes the cap.
  let n = Math.max(1, Math.round(total / target));
  if (total / n > max) n = Math.ceil(total / max);
  n = Math.min(n, units.length);
  let groups = partition(units, n);
  const longest = (g: number[][]) => Math.max(...g.map((idx) => idx.reduce((s, i) => s + units[i]!.sec, 0)));
  while (longest(groups) > max + 1e-9 && n < units.length) {
    n += 1;
    groups = partition(units, n);
  }
  if (groups.length > maxScenes) {
    return { ok: false, reason: 'too_many_scenes', detail: `the script needs ${groups.length} scenes; the limit is ${maxScenes}` };
  }
  // Merge a tiny tail/head scene into its neighbour when both stay under the cap.
  groups = mergeTiny(groups, units, max);
  const scenes = groups.map((idx, index) => {
    const us = idx.map((i) => units[i]!);
    const sceneText = us.map((u) => u.text).join(' ');
    return {
      index,
      text: sceneText,
      direction: us.flatMap((u) => u.directions).join('; '),
      estSec: estimateSeconds(sceneText, pace, lang),
    };
  });
  return { ok: true, lang, scenes, totalSec: Math.round(scenes.reduce((s, x) => s + x.estSec, 0) * 10) / 10 };
}

function mergeTiny(groups: number[][], units: readonly Unit[], max: number): number[][] {
  const sec = (g: number[]) => g.reduce((s, i) => s + units[i]!.sec, 0);
  const out = groups.map((g) => [...g]);
  for (let k = 0; k < out.length && out.length > 1; k++) {
    if (sec(out[k]!) >= MIN_SCENE_SEC) continue;
    const left = k > 0 ? sec(out[k - 1]!) : Infinity;
    const right = k < out.length - 1 ? sec(out[k + 1]!) : Infinity;
    const into = left <= right ? k - 1 : k + 1;
    if (into < 0 || into >= out.length || sec(out[into]!) + sec(out[k]!) > max) continue;
    out[into] = into < k ? [...out[into]!, ...out[k]!] : [...out[k]!, ...out[into]!];
    out.splice(k, 1);
    k = -1;
  }
  return out;
}

/** Re-split one scene's text after the user edits it (the editor keeps every other scene as it is). */
export function resplitScene(text: string, pace: Pace = 'natural'): SplitResult {
  return splitScript(text, { pace });
}

/**
 * Omni renders ≤ 10 s per turn: a scene is said in turns of about 10 s (one generate + extends), cut at sentence or
 * clause boundaries so no turn ends mid-word. Live says the whole scene in one take and does not use this.
 */
export function omniTurns(text: string, pace: Pace = 'natural', turnSec = 10): string[] {
  const lang = scriptLang(text);
  const sentences = splitSentences(text).flatMap((s) => cutLongSentence(s, turnSec, pace, lang));
  if (sentences.length <= 1) return sentences;
  // Finer pieces, tried only when whole sentences cannot fill the fewest turns: every clause on its own.
  const clauses = sentences.flatMap((s) => s.split(/(?<=[,;:—–])\s+/u).filter(Boolean));
  const toUnits = (ps: string[]): Unit[] => ps.map((p) => ({ text: p, directions: [], paraEnd: false, sec: estimateSeconds(p, pace, lang) }));
  const fits = (units: Unit[], n: number): string[] | null => {
    if (n > units.length) return null;
    const groups = partition(units, n).map((g) => g.map((i) => units[i]!.text).join(' '));
    return groups.every((g) => estimateSeconds(g, pace, lang) <= turnSec + 1e-9) ? groups : null;
  };
  // As few turns as the length allows, spread evenly (3 × 10 s, not 10 + 10 + 8 + 2), each ≤ turnSec.
  const bySentence = toUnits(sentences), byClause = toUnits(clauses);
  for (let n = Math.max(1, Math.ceil(estimateSeconds(text, pace, lang) / turnSec - 1e-9)); n <= byClause.length; n++) {
    const got = fits(bySentence, n) ?? fits(byClause, n);
    if (got) return got;
  }
  return sentences;
}
