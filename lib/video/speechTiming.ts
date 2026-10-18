/**
 * lib/video/speechTiming.ts — how long a spoken line takes, and whether a scene can hold it.
 *
 * WHY THIS EXISTS. A Veo clip is 8 s at most and it speaks whatever line it is handed. A line longer than
 * the clip does not fail: Veo rushes it, swallows words, or simply stops mid-sentence when the shot ends.
 * The 2026-10-16 ad film proved it: three Georgian lines of 36–42 syllables, one per 8 s scene, came back
 * with speech starting on frame 0, running to the last frame and, in the third scene, cut off. Nothing
 * upstream measured the words against the time, so the studio charged for a film that could not be right.
 *
 * The model here is deliberately simple and conservative: syllables ÷ a natural presenter pace, plus a
 * short breath at every sentence/clause break. Georgian is written phonemically (every vowel letter is a
 * syllable), so the count is exact for the language this studio speaks most; other scripts use vowel groups.
 */

/** Natural, unhurried presenter pace in syllables per second (broadcast pace is ~5–6; we leave room). */
const SYLLABLES_PER_SEC: Readonly<Record<string, number>> = {
  Georgian: 4.6,
  Russian: 4.6,
  English: 4.2,
};
const DEFAULT_SYLLABLES_PER_SEC = 4.4;

/** A breath at a sentence end / a clause break. */
const SENTENCE_PAUSE_SEC = 0.35;
const CLAUSE_PAUSE_SEC = 0.15;

/** Room a clip keeps free of speech: a beat before the first word and a closed-mouth beat after the last. */
export const SPEECH_LEAD_SEC = 0.4;
export const SPEECH_TAIL_SEC = 0.6;

/** Tolerance before a line counts as too long (the estimate is an estimate). */
export const OVERFLOW_TOLERANCE = 1.1;

const GEORGIAN_VOWELS = /[აეიოუ]/g;
const LATIN_VOWEL_GROUPS = /[aeiouyáéíóúàèìòùäëïöüâêîôû]+/gi;
const CYRILLIC_VOWEL_GROUPS = /[аеёиоуыэюяіїє]+/gi;

export function spokenLanguageOf(text: string): string | null {
  const s = String(text || '');
  if (/[Ⴀ-ჿ]/.test(s)) return 'Georgian';
  if (/[Ѐ-ӿ]/.test(s)) return 'Russian';
  if (/[A-Za-z]/.test(s)) return 'English';
  return null;
}

/** Syllables in a line. Exact for Georgian (one vowel letter = one syllable), a vowel-group estimate elsewhere. */
export function countSyllables(text: string): number {
  const s = String(text || '');
  let n = (s.match(GEORGIAN_VOWELS) || []).length;
  n += (s.match(CYRILLIC_VOWEL_GROUPS) || []).length;
  // English: vowel groups, minus a silent final "e" in longer words.
  for (const word of s.match(/[A-Za-z]+/g) || []) {
    let g = (word.match(LATIN_VOWEL_GROUPS) || []).length;
    if (g > 1 && /[^aeiouy]e$/i.test(word)) g -= 1;
    n += Math.max(1, g);
  }
  // Digits are spoken as words; a rough two syllables each keeps "24/7" from reading as free.
  n += (s.match(/\d/g) || []).length * 2;
  // A script we do not model (CJK, Arabic…): fall back to letters ÷ 2.
  if (n === 0) n = Math.ceil(s.replace(/[\s\p{P}]/gu, '').length / 2);
  return n;
}

/** Estimated seconds to speak `text` at a natural pace. */
export function speechSeconds(text: string, language?: string | null): number {
  const s = String(text || '').trim();
  if (!s) return 0;
  const lang = language ?? spokenLanguageOf(s);
  const rate = (lang && SYLLABLES_PER_SEC[lang]) || DEFAULT_SYLLABLES_PER_SEC;
  // Breaks INSIDE the line (a trailing full stop ends the line; it is not a pause before more words).
  const body = s.replace(/[.!?…]+\s*$/, '');
  const sentences = (body.match(/[.!?…]+\s/g) || []).length;
  const clauses = (body.match(/[,;:—–-]\s/g) || []).length;
  return countSyllables(s) / rate + sentences * SENTENCE_PAUSE_SEC + clauses * CLAUSE_PAUSE_SEC;
}

/** Seconds of speech one clip can hold without rushing or cutting a word. */
export function sceneSpeechCapacity(clipSec: number): number {
  const sec = Number.isFinite(clipSec) && clipSec > 0 ? clipSec : 8;
  return Math.max(0, sec - SPEECH_LEAD_SEC - SPEECH_TAIL_SEC);
}

export interface SceneSpeechCheck {
  /** 1-based scene number. */
  scene: number;
  seconds: number;
  capacity: number;
  overflow: boolean;
}

export interface SpeechPlanCheck {
  scenes: SceneSpeechCheck[];
  /** Any scene's line is longer than its clip can say. */
  overflow: boolean;
  /** Speech in the whole film. */
  totalSeconds: number;
  /** Scenes the film would need, at this clip length, for every word to fit. */
  scenesNeeded: number;
}

/** Check each scene's spoken text against its clip. `lines[i]` is everything scene i says ('' = silent). */
export function checkSceneSpeech(lines: readonly (string | null | undefined)[], clipSec: number): SpeechPlanCheck {
  const capacity = sceneSpeechCapacity(clipSec);
  const scenes = lines.map((l, i) => {
    const seconds = round1(speechSeconds(String(l ?? '')));
    return { scene: i + 1, seconds, capacity: round1(capacity), overflow: seconds > capacity * OVERFLOW_TOLERANCE };
  });
  const totalSeconds = round1(scenes.reduce((a, s) => a + s.seconds, 0));
  const scenesNeeded = Math.max(lines.length, capacity > 0 ? Math.ceil(totalSeconds / capacity) : lines.length);
  return { scenes, overflow: scenes.some((s) => s.overflow), totalSeconds, scenesNeeded };
}

/**
 * Re-flow a whole spoken script across `sceneCount` scenes so no scene carries more than it can say.
 *
 * The script is cut ONLY between words, preferring a sentence end, then a clause break, and the cut points
 * balance the speaking time. With chained scenes (each clip ending on the next one's first frame) a sentence
 * that runs across a cut is continuous speech, exactly as an editor would cut a long take.
 *
 * Returns null when the script does not fit `sceneCount` scenes at all — the caller must ask for more scenes
 * (or a shorter script) rather than charge for a film whose words cannot be spoken.
 */
export function reflowSpeech(script: string, sceneCount: number, clipSec: number): string[] | null {
  const n = Math.max(1, Math.floor(sceneCount));
  const capacity = sceneSpeechCapacity(clipSec);
  const words = String(script || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return Array.from({ length: n }, () => '');
  const lang = spokenLanguageOf(script);
  const total = speechSeconds(words.join(' '), lang);
  if (total > capacity * n * OVERFLOW_TOLERANCE) return null;

  // Cumulative speaking time at the end of each word (pauses included), so a cut is placed by time, not count.
  const cum: number[] = [];
  let acc = 0;
  for (const w of words) {
    acc += countSyllables(w) / ((lang && SYLLABLES_PER_SEC[lang]) || DEFAULT_SYLLABLES_PER_SEC);
    if (/[.!?…]$/.test(w)) acc += SENTENCE_PAUSE_SEC;
    else if (/[,;:—–]$/.test(w)) acc += CLAUSE_PAUSE_SEC;
    cum.push(acc);
  }
  const breakScore = (w: string): number => (/[.!?…]$/.test(w) ? 2 : /[,;:—–]$/.test(w) ? 1 : 0);

  const out: string[] = [];
  let start = 0;
  for (let s = 0; s < n; s++) {
    const remainingScenes = n - s;
    if (s === n - 1) {
      out.push(words.slice(start).join(' '));
      break;
    }
    const before = start > 0 ? cum[start - 1]! : 0;
    const target = before + (total - before) / remainingScenes;
    // Candidate cut = last word index of this scene. Search near the balanced target for a natural break
    // that still fits the scene, and never leave the remaining scenes more than they can say.
    let best = -1;
    let bestCost = Infinity;
    for (let k = start; k < words.length - (remainingScenes - 1); k++) {
      const len = cum[k]! - before;
      if (len > capacity * OVERFLOW_TOLERANCE) break;
      const rest = total - cum[k]!;
      if (rest > capacity * (remainingScenes - 1) * OVERFLOW_TOLERANCE) continue;
      const cost = Math.abs(cum[k]! - target) - breakScore(words[k]!) * 0.6;
      if (cost < bestCost) { bestCost = cost; best = k; }
    }
    if (best < 0) return null;
    out.push(words.slice(start, best + 1).join(' '));
    start = best + 1;
  }
  while (out.length < n) out.push('');
  return out;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export interface SpeechFit {
  /** The whole script can be said by these scenes. */
  fits: boolean;
  speechSec: number;
  capacitySec: number;
  /** Scenes the script needs at this clip length. */
  scenesNeeded: number;
}

/** Whether a typed script fits a board of `sceneCount` × `clipSec` scenes (the studio's pre-render check). */
export function speechFit(script: string, sceneCount: number, clipSec: number): SpeechFit {
  const speechSec = round1(speechSeconds(script));
  const capacity = sceneSpeechCapacity(clipSec);
  const scenes = Math.max(1, Math.floor(sceneCount));
  return {
    fits: speechSec <= capacity * scenes * OVERFLOW_TOLERANCE,
    speechSec,
    capacitySec: round1(capacity * scenes),
    scenesNeeded: capacity > 0 ? Math.max(scenes, Math.ceil(speechSec / (capacity * OVERFLOW_TOLERANCE))) : scenes,
  };
}

/** The note the storyboard shows when the words do not fit: what is wrong and the two ways to fix it. */
export function speechFitNote(fit: SpeechFit, clipSec: number, locale: string): string {
  const needSec = fit.scenesNeeded * clipSec;
  if (locale === 'en') {
    return `The text takes about ${fit.speechSec} s to say, but these scenes hold ${fit.capacitySec} s — words would be rushed or cut. Add scenes (${fit.scenesNeeded} × ${clipSec} s = ${needSec} s) or shorten the text.`;
  }
  if (locale === 'ru') {
    return `Текст звучит около ${fit.speechSec} с, а эти сцены вмещают ${fit.capacitySec} с — слова будут скомканы или обрезаны. Добавьте сцены (${fit.scenesNeeded} × ${clipSec} с = ${needSec} с) или сократите текст.`;
  }
  return `ტექსტის წარმოთქმას დაახლოებით ${fit.speechSec} წმ სჭირდება, ეს სცენები კი ${fit.capacitySec} წმ-ს იტევს, ამიტომ სიტყვები აჩქარდება ან მოიჭრება. დაამატეთ სცენები (${fit.scenesNeeded} × ${clipSec} წმ = ${needSec} წმ) ან შეამოკლეთ ტექსტი.`;
}
