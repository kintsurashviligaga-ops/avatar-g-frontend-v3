/**
 * lib/billing/v5/bogScorecard.ts — the 13-check BOG sandbox scorecard (v5.1 Phase 5, M-11; PREPARED). Pure.
 *
 * Where each certification check gets its evidence today:
 *   - `sandbox`: __tests__/integration/bog-sandbox.e2e.test.ts (S1–S7), run by .github/workflows/bog-e2e.yml against
 *     BOG's REAL sandbox. That job runs only when the Actions secrets BOG_SANDBOX_CLIENT_ID / BOG_SANDBOX_SECRET_KEY are
 *     set; without them it SKIPS with a notice and still shows green. A green check is therefore not evidence: only its
 *     artifact (bog-sandbox-e2e.txt) is.
 *   - `isolated`: the same workflow's fake-BOG suite (E1–E21, local Postgres), which runs on every PR.
 *   - `callback`: BOG's server-to-server callback needs a public HTTPS URL. A CI runner has none, so the real signed
 *     callback (and the replay of it) needs one manual run with a tunnel, or a staging project that is NOT production.
 *
 * GG 2026-11-13 13:06Z: until the sandbox pair is in the repository's Actions secrets, every sandbox check is BLOCKED
 * (never "passed"), and `certify()` cannot pass.
 */
import { BOG_CERT_STEPS, certify, type CertEvidence, type CertStepId } from './bogCertification';

export type ScoreStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_REQUIRED';
export type Source = { kind: 'sandbox' | 'isolated' | 'callback'; ref: string };

/** Which test proves which check. `sandbox` is the evidence certify() counts; `isolated` is the offline backstop. */
export const SCORECARD_SOURCES: Record<CertStepId, Source[]> = {
  oauth: [{ kind: 'sandbox', ref: 'S1' }],
  create_order: [{ kind: 'sandbox', ref: 'S2' }],
  pay_test_card: [{ kind: 'sandbox', ref: 'S2 (card 4000…0001 on BOG’s page)' }],
  callback_signature: [{ kind: 'callback', ref: 'manual run with a public callback URL' }, { kind: 'isolated', ref: 'fake-BOG signed callbacks' }],
  fulfil_once: [{ kind: 'sandbox', ref: 'S2 (100 credits, once)' }, { kind: 'isolated', ref: 'concurrency scenarios' }],
  callback_replay: [{ kind: 'callback', ref: 'resend the captured callback' }, { kind: 'isolated', ref: 'replayed callback' }],
  forged_callback: [{ kind: 'isolated', ref: 'bad signature → 401' }],
  amount_mismatch: [{ kind: 'isolated', ref: 'receipt amount ≠ our row' }],
  lost_callback_cron: [{ kind: 'sandbox', ref: 'S2 settles from the receipt with no callback; S6 refund sweep' }],
  decline: [{ kind: 'sandbox', ref: 'S3 (card 4000…0002)' }],
  refund: [{ kind: 'sandbox', ref: 'S6, S7' }],
  limits: [{ kind: 'isolated', ref: 'over-limit order → 400 BOG_LIMIT before BOG is asked' }],
  saved_card_renewal: [{ kind: 'sandbox', ref: 'S4 renewal, S5 rejected renewal' }],
};

export interface ScoreRow { step: CertStepId; what: string; status: ScoreStatus; sources: Source[]; detail: string }

/**
 * One row per check. `evidence` is what a real sandbox run produced (bogCertification's CertEvidence, latest wins);
 * `havePair` is whether the sandbox pair is configured at all. Isolated-only checks (forged callback, amount mismatch,
 * limits) are refusals we make before BOG answers, so a sandbox run can confirm them but they never wait on BOG.
 */
export function scorecard(env: string | undefined, evidence: readonly CertEvidence[], opts: { havePair: boolean; autoPayments: boolean }): { rows: ScoreRow[]; certified: boolean; summary: Record<ScoreStatus, number> } {
  const latest = new Map<CertStepId, CertEvidence>();
  // Evidence from anywhere but BOG_ENV=sandbox counts for nothing here, exactly as in certify().
  const fromSandbox = (env ?? '').trim().toLowerCase() === 'sandbox';
  const ordered = fromSandbox ? [...evidence].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)) : [];
  for (const e of ordered) latest.set(e.step, e);
  const rows: ScoreRow[] = BOG_CERT_STEPS.map((s) => {
    const sources = SCORECARD_SOURCES[s.id];
    if (s.required === 'if_auto_payments' && !opts.autoPayments) return { step: s.id, what: s.what, status: 'NOT_REQUIRED', sources, detail: 'automatic payments are not enabled for the merchant' };
    const e = latest.get(s.id);
    if (e) return { step: s.id, what: s.what, status: e.passed ? 'PASS' : 'FAIL', sources, detail: e.detail };
    if (!opts.havePair) return { step: s.id, what: s.what, status: 'BLOCKED', sources, detail: 'no BOG sandbox pair yet (Actions secrets BOG_SANDBOX_CLIENT_ID / BOG_SANDBOX_SECRET_KEY)' };
    return { step: s.id, what: s.what, status: 'BLOCKED', sources, detail: sources.some((x) => x.kind === 'callback') ? 'needs a run with a public callback URL' : 'not run yet' };
  });
  const summary: Record<ScoreStatus, number> = { PASS: 0, FAIL: 0, BLOCKED: 0, NOT_REQUIRED: 0 };
  for (const r of rows) summary[r.status] += 1;
  return { rows, certified: certify(env, evidence, { autoPayments: opts.autoPayments }).certified, summary };
}
