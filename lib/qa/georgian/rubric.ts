/**
 * lib/qa/georgian/rubric.ts — v5.1 Phase 8: how one Georgian answer is scored, and how the corpus gets its verdict.
 *
 * Seven dimensions, each 0–4 with written anchors. Some are scored by code (lib/qa/georgian/score), some only by a
 * native Georgian reviewer, some by both (code can fail them, only a person can pass them). A case is scored on the
 * dimensions it lists (QaCase.dims); the weights of the rest are left out, not counted as zero.
 *
 * Verdicts follow spec §33: PASS, CONDITIONAL_PASS, FAIL, NOT_VERIFIED. Code alone can never give PASS: a case with any
 * human dimension still unscored is NOT_VERIFIED.
 */
import type { QaDimension } from './corpus';

export type Score = 0 | 1 | 2 | 3 | 4;
export type Verdict = 'PASS' | 'CONDITIONAL_PASS' | 'FAIL' | 'NOT_VERIFIED';
export type Scorer = 'auto' | 'human' | 'both';

export interface DimensionSpec {
  id: QaDimension;
  name: string;
  weight: number;
  scorer: Scorer;
  /** Anchors for 4, 3, 2, 1, 0 (index 0 = score 4). */
  anchors: readonly [string, string, string, string, string];
  /** What makes this dimension a critical failure for the whole case. */
  critical?: string;
}

export const RUBRIC: readonly DimensionSpec[] = [
  {
    id: 'language', name: 'Language and script', weight: 15, scorer: 'auto',
    anchors: [
      'Whole answer in Georgian (Mkhedruli); Latin only for names, links, code or the user\'s own Latin words.',
      'Georgian, with a few needless English or Russian words.',
      'Mostly Georgian, but whole phrases in another language.',
      'Half Georgian, half another language.',
      'Not Georgian, or letters of an alphabet the product never writes.',
    ],
    critical: 'Answer not in Georgian, or any Devanagari / Arabic / Armenian / Hangul / Ethiopic / other foreign letters.',
  },
  {
    id: 'grammar', name: 'Grammar and naturalness', weight: 20, scorer: 'human',
    anchors: [
      'Reads like a careful native speaker wrote it: correct cases, verb agreement, register and word order.',
      'One or two small slips a native reader forgives (a postposition, a missing comma).',
      'Clearly understandable but sounds translated, or several grammar slips.',
      'Frequent errors; meaning sometimes unclear.',
      'Broken Georgian, wrong register throughout (e.g. "შენ" in a formal letter), or unreadable.',
    ],
  },
  {
    id: 'intent', name: 'Intent preservation', weight: 25, scorer: 'both',
    anchors: [
      'Did exactly what was asked, kept every number, name, quoted line, format and limit.',
      'Did what was asked; one minor detail softened (e.g. a style word).',
      'Right task, but one stated constraint lost (length, aspect, voice, count).',
      'Partly the wrong task, or several constraints lost.',
      'Wrong task, or a quoted line / brand / name translated or changed.',
    ],
    critical: 'A verbatim item (quoted line, brand, name, URL) lost or translated; or the wrong service started.',
  },
  {
    id: 'culture', name: 'Cultural and historical accuracy', weight: 15, scorer: 'human',
    anchors: [
      'Every fact right and in context; a false premise in the question is politely corrected.',
      'Facts right; slightly thin or one harmless simplification.',
      'One factual slip that does not change the point.',
      'A wrong date, name or place that matters.',
      'Invented history, a false premise accepted, or a disrespectful / stereotyped take.',
    ],
    critical: 'Contradicts a reference fact, or accepts and elaborates a false premise.',
  },
  {
    id: 'pronunciation', name: 'Georgian pronunciation (audio)', weight: 10, scorer: 'human',
    anchors: [
      'Native-sounding: ejectives (კ პ ტ წ ჭ ყ), clusters (მწვრთნელი, ბრძ) and stress natural; numbers read as Georgian words.',
      'Clearly Georgian, one or two sounds slightly off.',
      'Understandable but with an obvious foreign accent or a misread number.',
      'Several words hard to understand.',
      'Not Georgian sounds, wrong language, or gibberish.',
    ],
  },
  {
    id: 'lipsync', name: 'Lip-sync (video)', weight: 5, scorer: 'human',
    anchors: [
      'Mouth matches every syllable; the right person speaks; the line is said once.',
      'Matches, with a short drift.',
      'Noticeable drift or the line repeated.',
      'Mouth mostly does not match, or the wrong person speaks.',
      'No speech, or an unrelated mouth movement.',
    ],
  },
  {
    id: 'honesty', name: 'Honesty and fallbacks', weight: 10, scorer: 'both',
    anchors: [
      'Says plainly what it did and did not do; failures say "nothing was charged"; limits stated; sources named.',
      'Honest but vague about one limit.',
      'Leaves out that something was skipped.',
      'Overstates what was done.',
      'Claims success after a failure, invents data (weather, results, sources) or hides a charge.',
    ],
    critical: 'Claims success after a failure, invents data, or a charge for a Google-side failure (D-15).',
  },
];

export const RUBRIC_BY_ID: Readonly<Record<QaDimension, DimensionSpec>> = Object.fromEntries(RUBRIC.map((d) => [d.id, d])) as never;

/** A case passes at this weighted score (0–100) when nothing is critical and every dimension is scored. */
export const CASE_PASS = 75;
/** The corpus is CONDITIONAL_PASS when at least this share of cases pass and none is critical. */
export const CORPUS_CONDITIONAL = 0.9;

export interface DimensionResult {
  /** null = not scored yet. */
  score: Score | null;
  critical: boolean;
  why: string[];
}

export interface CaseResult {
  id: string;
  /** 0–100 over the scored dimensions; null when nothing is scored. */
  weighted: number | null;
  dims: Partial<Record<QaDimension, DimensionResult>>;
  critical: boolean;
  verdict: Verdict;
}

/** Weighted 0–100 over the dimensions that have a score. */
export function weightedScore(dims: Partial<Record<QaDimension, DimensionResult>>): number | null {
  let got = 0, max = 0;
  for (const [id, r] of Object.entries(dims) as [QaDimension, DimensionResult][]) {
    if (r.score === null) continue;
    const w = RUBRIC_BY_ID[id].weight;
    got += w * r.score;
    max += w * 4;
  }
  return max === 0 ? null : Math.round((got / max) * 1000) / 10;
}

export function caseVerdict(id: string, dims: Partial<Record<QaDimension, DimensionResult>>): CaseResult {
  const critical = Object.values(dims).some((r) => r?.critical);
  const weighted = weightedScore(dims);
  const unscored = Object.values(dims).some((r) => r?.score === null);
  const verdict: Verdict = critical ? 'FAIL' : unscored ? 'NOT_VERIFIED' : weighted !== null && weighted >= CASE_PASS ? 'PASS' : 'FAIL';
  return { id, weighted, dims, critical, verdict };
}

export interface CorpusResult {
  verdict: Verdict;
  pass: number;
  fail: number;
  notVerified: number;
  critical: string[];
  cases: CaseResult[];
}

/** Any critical case → FAIL. Any unverified → NOT_VERIFIED. All pass → PASS. ≥ 90% pass → CONDITIONAL_PASS. Else FAIL. */
export function corpusVerdict(cases: CaseResult[]): CorpusResult {
  const pass = cases.filter((c) => c.verdict === 'PASS').length;
  const notVerified = cases.filter((c) => c.verdict === 'NOT_VERIFIED').length;
  const critical = cases.filter((c) => c.critical).map((c) => c.id);
  const fail = cases.length - pass - notVerified;
  const verdict: Verdict = critical.length ? 'FAIL'
    : notVerified ? 'NOT_VERIFIED'
      : pass === cases.length ? 'PASS'
        : cases.length && pass / cases.length >= CORPUS_CONDITIONAL ? 'CONDITIONAL_PASS' : 'FAIL';
  return { verdict, pass, fail, notVerified, critical, cases };
}
