/**
 * lib/services/dubbing/translateSegments.ts — dubbing leg 3, Gemini translation (Master Task §2.3.2).
 *
 * NOT a generic translator. Dubbing translation has a constraint ordinary translation does not: the result
 * has to be SPEAKABLE IN THE SAME NUMBER OF SECONDS as the original line. A faithful translation that runs
 * 40% long cannot be fitted onto the original mouth — `fitSpeed` clamps at 1.25×, so the overflow gets
 * clipped or the segment collides with the next one. So the prompt asks for length-matched dialogue, and
 * the caller keeps the timings.
 *
 * The segment list survives the round trip INDEX-FOR-INDEX. That invariant is the whole ballgame: a model
 * that merges two lines or drops an empty one silently shifts every later line onto the wrong mouth. When
 * the returned array does not line up, we fall back to per-segment translation rather than trusting it.
 */
import { llmText } from '@/lib/ai/llmText';
import type { DubbingLanguage, DubbingSegment } from './dubbingPlan';

/** Model-facing language names — 'ka' means nothing to an LLM, 'Georgian' does. */
export const LANGUAGE_NAMES: Record<DubbingLanguage, string> = {
  ka: 'Georgian', en: 'English', ru: 'Russian', de: 'German', fr: 'French', es: 'Spanish',
  it: 'Italian', tr: 'Turkish', ar: 'Arabic', zh: 'Mandarin Chinese', ja: 'Japanese', ko: 'Korean',
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code as DubbingLanguage] ?? code;
}

/** Segments per model call. Small enough to stay well inside the output cap, big enough for context. */
const BATCH_SIZE = 25;

function systemPrompt(target: string, source: string | null): string {
  return [
    `You are a professional DUBBING translator. Translate ${source ? `${source} ` : ''}dialogue into ${target}.`,
    '',
    'DUBBING RULES — these override literal accuracy:',
    `1. Each line must take ABOUT THE SAME TIME TO SPEAK ALOUD in ${target} as the original does. Prefer a`,
    '   shorter, natural phrasing over a complete but long one. Never pad.',
    '2. Keep the speaking register: casual stays casual, formal stays formal, insults stay insults.',
    '3. Keep proper nouns, brand names and numbers as they are.',
    '4. Output DIALOGUE ONLY. No stage directions, no speaker labels, no quotation marks, no notes.',
    '',
    'OUTPUT FORMAT — exactly one line per input line, numbered the same way:',
    '1. <translation>',
    '2. <translation>',
    'Never merge lines. Never split lines. Never skip a number. If a line is untranslatable, repeat it.',
  ].join('\n');
}

/**
 * Parse `1. text` / `1) text` numbered output back into a dense array. Exported for tests — the parser is
 * where index drift would be introduced, so it is the part worth pinning down.
 */
export function parseNumberedLines(raw: string, expected: number): string[] | null {
  const out = new Array<string>(expected).fill('');
  let seen = 0;
  for (const line of raw.split('\n')) {
    const m = /^\s*(\d{1,4})\s*[.):\]]\s*(.*)$/.exec(line);
    if (!m) continue;
    const idx = Number(m[1]) - 1;
    if (idx < 0 || idx >= expected) continue;
    const text = (m[2] ?? '').trim();
    if (!text) continue;
    // First write wins: a model that repeats a number should not clobber the good line with a stray one.
    if (!out[idx]) { out[idx] = text; seen += 1; }
  }
  // A partial parse is worse than none — the gaps would be dubbed as silence at unpredictable points.
  return seen === expected ? out : null;
}

async function translateBatch(
  texts: readonly string[],
  target: string,
  source: string | null,
): Promise<string[] | null> {
  const user = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const raw = await llmText({
    system: systemPrompt(target, source),
    user,
    geminiFirst: true, // Master Task §1.2 — Gemini is primary; the chain still covers an outage.
    maxTokens: Math.min(8000, 220 * texts.length + 400),
    timeoutMs: 90_000,
  });
  return raw ? parseNumberedLines(raw, texts.length) : null;
}

/** Last resort when a batch will not line up: translate one line at a time so indices cannot drift. */
async function translateOneByOne(
  texts: readonly string[],
  target: string,
  source: string | null,
): Promise<string[]> {
  const out: string[] = [];
  for (const t of texts) {
    const raw = await llmText({
      system: systemPrompt(target, source),
      user: `1. ${t}`,
      geminiFirst: true,
      maxTokens: 400,
      timeoutMs: 45_000,
    });
    const parsed = raw ? parseNumberedLines(raw, 1) : null;
    // Falling back to the ORIGINAL text keeps the segment count intact and the line audible in the source
    // language — wrong language beats a hole in the dub.
    out.push(parsed?.[0] || raw?.trim().replace(/^\s*\d+\s*[.):\]]\s*/, '') || t);
  }
  return out;
}

export interface TranslationOutcome {
  segments: DubbingSegment[];
  /** How many lines came back untranslated (fell through to the original). 0 = a clean pass. */
  untranslated: number;
}

/**
 * Translate every segment's `text` into `targetLanguage`, writing the result to `translated` and LEAVING
 * `text`, `startSec`, `endSec` and `speaker` untouched. Timings belong to the original performance; nothing
 * downstream may move them.
 */
export async function translateSegments(
  segments: readonly DubbingSegment[],
  targetLanguage: DubbingLanguage,
  sourceLanguage?: string | null,
): Promise<TranslationOutcome> {
  if (!segments.length) return { segments: [], untranslated: 0 };
  const target = languageName(targetLanguage);
  const source = sourceLanguage ? languageName(sourceLanguage) : null;

  const translated: string[] = [];
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const slice = segments.slice(i, i + BATCH_SIZE).map((s) => s.text);
    const batch = await translateBatch(slice, target, source);
    translated.push(...(batch ?? (await translateOneByOne(slice, target, source))));
  }

  let untranslated = 0;
  const out = segments.map((s, i) => {
    const t = (translated[i] || '').trim();
    if (!t || t === s.text) untranslated += 1;
    return { ...s, translated: t || s.text };
  });
  return { segments: out, untranslated };
}
