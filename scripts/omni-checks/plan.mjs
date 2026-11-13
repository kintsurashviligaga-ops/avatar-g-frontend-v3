/**
 * The three paid Gemini Omni checks owed before v5.1 M-3 (#295, Omni 1.1 → 1.2) is called done (GG D-07, ~$2):
 *
 *   C1  a NEW clip with a Georgian line, 4 s 720p      → made on gemini-omni-1.2-flash (`m2` in its job id), ✦20
 *   C2  „გააგრძელე" on C1's clip, +4 s 720p            → continued on 1.2 (the id keeps `m2`), ✦25
 *   C3  „გააგრძელე" on a clip made BEFORE #295 (1.1)    → continued on 1.1 (no `m2`), ✦25, OR, when Google has already
 *                                                         dropped that interaction (Vertex keeps it 7 days), an honest
 *                                                         failure with the credits refunded
 *
 * Pure: prices, the job-id reading, the budget and the verdicts. run.mjs does the HTTP. Tested in plan.test.ts.
 */

/** The price book rows (lib/credits/priceBook, GG card 2026-11-12 14:22Z) these checks expect. */
export const EXPECTED_CREDITS = { clip720_4: 20, extend720_4: 25 };

/** Hard stop for one full run: C1 + C2 + C3 at the rows above, nothing more. */
export const MAX_RUN_CREDITS = EXPECTED_CREDITS.clip720_4 + 2 * EXPECTED_CREDITS.extend720_4; // 70

/** ≈ $ per ✦ at retail (docs: video E2E tally, 2026-10-26). Shown to the person; never used to decide anything. */
export const USD_PER_CREDIT = 0.0148;

/** Short enough to fit a 4 s clip (lib/video/clipPrompt clipSpeechFits; plan.test.ts holds it there). */
export const DEFAULT_CLIP_LINE = 'გამარჯობა, ეს ახალი ვერსიაა.';
export const DEFAULT_CLIP_PROMPT =
  `ახალგაზრდა ქალი თბილისის კაფეში, კამერისკენ იყურება და იღიმის. ის ამბობს: „${DEFAULT_CLIP_LINE}"`;
export const DEFAULT_EXTEND_LINE = 'ეს კი გაგრძელებაა.';
export const DEFAULT_EXTEND_PROMPT = `გააგრძელე. ის ამბობს: „${DEFAULT_EXTEND_LINE}"`;

const SEP = '~';

/** The job id without its signed charge token (`<jobId>~<token>`). */
export function bareJobId(polledId) {
  const s = String(polledId ?? '');
  const at = s.lastIndexOf(SEP);
  return at === -1 ? s : s.slice(0, at);
}

/**
 * What an Omni job id says (lib/genjutsu/chargeToken composeOmniJobId): `<interaction>::<aspect>::<ms>::<tail>`, tail
 * `o4|o6|o8|o10` for a clip or `oe6|ox4…` for an edit/extend, plus `m2` when 1.2 made it. Null when it is not Omni's.
 */
export function readOmniJobId(polledId) {
  const parts = bareJobId(polledId).split('::');
  if (parts.length !== 4) return null;
  const m = /^o(?:([ex]))?(4|6|8|10)(m2)?$/.exec(parts[3]);
  if (!m) return null;
  return {
    op: m[1] === 'e' ? 'edit' : m[1] === 'x' ? 'extend' : 'clip',
    seconds: Number(m[2]),
    model: m[3] ? 'gemini-omni-1.2-flash' : 'gemini-omni-1.1-flash-preview',
    createdMs: Number(parts[2]),
    aspect: parts[1],
  };
}

/** Vertex Interactions are kept 7 days (v5.1 Phase 1, C4): after that a clip can no longer be continued. */
export const INTERACTION_TTL_MS = 7 * 24 * 3600 * 1000;

export function interactionAgeDays(polledId, nowMs = Date.now()) {
  const j = readOmniJobId(polledId);
  return j && Number.isFinite(j.createdMs) ? (nowMs - j.createdMs) / (24 * 3600 * 1000) : null;
}

/** Spend guard: may a step of `credits` start, with `spent` already gone in this run? */
export function withinBudget(spent, credits, max = MAX_RUN_CREDITS) {
  return Number.isInteger(credits) && credits > 0 && spent + credits <= max;
}

/**
 * The verdict of one check, from the start response, the final status and what the check expects.
 *   expectModel: the model the result must be on; allowRefundedFailure: C3 may end as a refunded failure.
 */
/**
 * Pass or fail one check from its start answer and final poll. Every result after a start carries the bare job id
 * (no charge token), so a timeout or a stop can still be looked up in the Library.
 */
export function judge(input) {
  const r = judgeInner(input);
  const id = input.start?.jobId ? bareJobId(input.start.jobId) : null;
  return id ? { ...r, jobId: id } : r;
}

function judgeInner({ name, start, final, expectCredits, expectModel, expectOp, allowRefundedFailure = false }) {
  const notes = [];
  if (!start || start.httpStatus !== 202 || !start.jobId) {
    return { name, pass: false, outcome: 'not_started', notes: [`start answered ${start?.httpStatus ?? 'nothing'} ${start?.error ?? ''}`.trim()] };
  }
  const job = readOmniJobId(start.jobId);
  if (!job) return { name, pass: false, outcome: 'not_omni', notes: ['the job id is not an Omni id'] };
  if (start.credits !== expectCredits) notes.push(`charged ✦${start.credits}, expected ✦${expectCredits}`);
  if (job.model !== expectModel) notes.push(`made on ${job.model}, expected ${expectModel}`);
  if (job.op !== expectOp) notes.push(`op ${job.op}, expected ${expectOp}`);

  if (final?.state === 'ready' && final.videoUrl) {
    return { name, pass: notes.length === 0, outcome: 'ready', model: job.model, credits: start.credits, videoUrl: final.videoUrl, notes };
  }
  if (final?.state === 'failed') {
    if (allowRefundedFailure && final.refunded === true && notes.length === 0) {
      return { name, pass: true, outcome: 'failed_refunded', model: job.model, credits: 0, notes: [`Google refused (${final.error ?? 'no reason'}); credits refunded`] };
    }
    notes.push(`failed: ${final.error ?? 'no reason'}; refunded=${final.refunded === true}`);
    return { name, pass: false, outcome: final.refunded === true ? 'failed_refunded' : 'failed_not_refunded', model: job.model, credits: final.refunded ? 0 : start.credits, notes };
  }
  notes.push(`no final state (${final?.state ?? 'timeout'})`);
  return { name, pass: false, outcome: 'timeout', model: job.model, credits: start.credits, notes };
}
