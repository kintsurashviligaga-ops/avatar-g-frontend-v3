/**
 * lib/qa/georgian/score.ts — v5.1 Phase 8: the automatic half of the Georgian rubric.
 *
 * Code checks what code can check honestly: the script and language of the answer, whether every number, name and quoted
 * line survived (in the answer or in the brief sent to the model), required content (a computed result, a correction, a
 * source link, "nothing was charged"), sentence counts, and phrases that must never appear. It can FAIL a dimension; it
 * can never PASS a dimension a person must judge (grammar, culture, pronunciation, lip-sync, and the human half of intent
 * and honesty). Pure; no network, no model calls.
 */
import { isMisheardScript } from '@/lib/voice/heardScript';
import type { KeepRule, QaCase, QaDimension } from './corpus';
import { RUBRIC_BY_ID, caseVerdict, type CaseResult, type DimensionResult, type Score } from './rubric';

/** What one run of a case produced. */
export interface QaOutput {
  /** The text the user saw (for speech: the transcript of what was said). */
  answer: string;
  /** The brief or prompt actually sent to the generator, when there was one (may be English). */
  brief?: string;
}

export type HumanScores = Partial<Record<QaDimension, Score>>;

const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/[„“”"«»]/gu, '"').replace(/[  ]/gu, ' ')
  .replace(/\s+/gu, ' ').trim();

const URL_RE = /https?:\/\/\S+|\b[\w-]+\.(?:ge|com|org|net)\b\S*/giu;
const CODE_RE = /```[\s\S]*?```|`[^`]*`/gu;

/** Whether one variant appears; a bare number must stand alone (8 is not the 8 in 2026). */
export function hasVariant(text: string, variant: string): boolean {
  const t = norm(text), v = norm(variant);
  if (/^\d+$/.test(v)) {
    const alone = new RegExp(`(?<!\\d)${v}(?!\\d)`, 'u');
    return alone.test(t) || alone.test(t.replace(/(?<=\d) (?=\d{3}(?!\d))/gu, '')); // "30 000" is 30000
  }
  return t.includes(v) || t.replace(/ /g, '').includes(v.replace(/ /g, ''));
}

export const kept = (text: string, rule: KeepRule): boolean => rule.any.some((v) => hasVariant(text, v));

/** Share of Georgian letters among Georgian, Latin and Cyrillic letters, after links, code and the user's own Latin words. */
export function georgianShare(text: string, allowLatin: readonly string[] = []): number {
  let t = text.replace(CODE_RE, ' ').replace(URL_RE, ' ');
  for (const w of allowLatin) if (/[A-Za-z]/.test(w)) t = t.split(w).join(' ');
  const ka = (t.match(/\p{Script=Georgian}/gu) ?? []).length;
  const other = (t.match(/[\p{Script=Latin}\p{Script=Cyrillic}]/gu) ?? []).length;
  return ka + other === 0 ? 0 : ka / (ka + other);
}

/** Sentences, roughly: split on . ! ? … (a number like 14:30 or 2.5 does not end one). */
export function sentenceCount(text: string): number {
  return text.replace(CODE_RE, ' ').replace(URL_RE, ' ').split(/(?<!\d)[.!?…]+(?!\d)/u).map((s) => s.trim()).filter((s) => /\p{L}/u.test(s)).length;
}

const r = (score: Score | null, critical = false, why: string[] = []): DimensionResult => ({ score, critical, why });

/** Code's verdict on the dimensions it can see. For 'both' dimensions the score is a ceiling, not a pass. */
export function autoChecks(c: QaCase, out: QaOutput): Partial<Record<QaDimension, DimensionResult>> {
  const res: Partial<Record<QaDimension, DimensionResult>> = {};
  const answer = out.answer ?? '';
  const seen = `${answer}\n${out.brief ?? ''}`;
  const caps: Partial<Record<QaDimension, { cap: Score; critical: boolean; why: string[] }>> = {};
  const cap = (dim: QaDimension, to: Score, why: string, critical = false) => {
    const cur = caps[dim] ?? { cap: 4 as Score, critical: false, why: [] };
    caps[dim] = { cap: Math.min(cur.cap, to) as Score, critical: cur.critical || critical, why: [...cur.why, why] };
  };

  // Language and script (answer only: an English brief to the model is fine).
  if (c.dims.includes('language')) {
    const latinOwn = [...(c.keep ?? []).flatMap((k) => k.any), ...(c.prompt.match(/[A-Za-z][\w-]*/g) ?? [])];
    const share = georgianShare(answer, latinOwn);
    if (isMisheardScript(answer)) res.language = r(0, true, ['letters of an alphabet the product never writes']);
    else if (share < 0.5) res.language = r(0, true, [`only ${Math.round(share * 100)}% Georgian letters`]);
    else res.language = r(share >= 0.9 ? 4 : share >= 0.75 ? 3 : share >= 0.6 ? 2 : 1, false, [`${Math.round(share * 100)}% Georgian letters`]);
  }

  // Intent: every keep rule, in the answer or the brief.
  const lost = (c.keep ?? []).filter((k) => !kept(seen, k));
  for (const k of lost) cap('intent', k.verbatim ? 0 : 2, `lost: ${k.label}`, !!k.verbatim);
  if (lost.filter((k) => !k.verbatim).length > 1) cap('intent', 1, 'more than one constraint lost');
  if (c.sentences) {
    const n = sentenceCount(answer), off = Math.abs(n - c.sentences);
    if (off === 1) cap('intent', 3, `${n} sentences, asked ${c.sentences}`);
    else if (off > 1) cap('intent', 2, `${n} sentences, asked ${c.sentences}`);
  }
  if (c.mustAnswer && !c.mustAnswer.any.some((v) => hasVariant(answer, v))) {
    const dim = c.mustAnswer.dim ?? 'intent';
    cap(dim, dim === 'honesty' ? 1 : 2, `missing: ${c.mustAnswer.label}`);
  }
  for (const n of c.never ?? []) if (n.pattern.test(answer)) cap(n.dim ?? 'honesty', 0, `said: ${n.label}`, true);

  for (const [dim, k] of Object.entries(caps) as [QaDimension, { cap: Score; critical: boolean; why: string[] }][]) {
    if (!c.dims.includes(dim) && !k.critical) continue;
    res[dim] = r(k.cap, k.critical, k.why);
  }
  return res;
}

/**
 * One case: code's checks plus whatever the reviewer scored. A 'both' dimension takes the lower of the two; with no
 * human score it stays unscored unless code already failed it. A 'human' dimension code flagged critical stays failed.
 */
export function scoreCase(c: QaCase, out: QaOutput, human: HumanScores = {}): CaseResult {
  const auto = autoChecks(c, out);
  const dims: Partial<Record<QaDimension, DimensionResult>> = {};
  const all = new Set<QaDimension>([...c.dims, ...(Object.keys(auto) as QaDimension[])]);
  for (const id of all) {
    const spec = RUBRIC_BY_ID[id];
    const a = auto[id];
    const h = human[id] ?? null;
    if (a?.critical) { dims[id] = r(0, true, a.why); continue; }
    if (spec.scorer === 'auto') { dims[id] = a ?? r(null, false, ['no automatic result']); continue; }
    if (spec.scorer === 'human') { dims[id] = r(h, false, h === null ? ['waits for a native reviewer'] : ['reviewer']); continue; }
    // both
    if (h === null) dims[id] = a && a.score !== null && a.score < 4 ? r(a.score, false, a.why) : r(null, false, ['code found nothing; waits for a reviewer']);
    else dims[id] = r(Math.min(h, a?.score ?? 4) as Score, false, [...(a?.why ?? []), 'reviewer']);
  }
  return caseVerdict(c.id, dims);
}
