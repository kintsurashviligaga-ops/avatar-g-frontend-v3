/**
 * lib/billing/v5/bogCertification.ts — the BOG sandbox certification checklist (v5.1 Phase 5, M-11 / B-03; PREPARED).
 * Pure: it scores evidence, it never calls BOG.
 *
 * The payment code is already built and tested against a fake BOG (lib/billing/BOG_INTEGRATION.md, npm run
 * test:bog-e2e). What has never run is the REAL BOG sandbox, because the sandbox credentials have not arrived. When GG
 * has them, the run is local only (a sandbox pair never goes on Vercel: every deployment writes to the Production
 * database), with scripts/bog-sandbox-smoke.mjs and BOG's test cards. Each step below records one piece of evidence
 * (the BOG order id, the HTTP status, the row state); certify() says whether the run passes.
 *
 * Certified = every REQUIRED step passed, against BOG_ENV=sandbox. Saved-card renewal is required only when the bank
 * has enabled automatic payments for the merchant (otherwise plans sell as one month, by design).
 */
export type CertStepId =
  | 'oauth'
  | 'create_order'
  | 'pay_test_card'
  | 'callback_signature'
  | 'fulfil_once'
  | 'callback_replay'
  | 'forged_callback'
  | 'amount_mismatch'
  | 'lost_callback_cron'
  | 'decline'
  | 'refund'
  | 'limits'
  | 'saved_card_renewal';

export interface CertStep { id: CertStepId; what: string; pass: string; required: boolean | 'if_auto_payments' }

export const BOG_CERT_STEPS: readonly CertStep[] = [
  { id: 'oauth', what: 'one token request with the sandbox pair', pass: 'HTTP 200', required: true },
  { id: 'create_order', what: 'a 1 ₾ order', pass: 'BOG order id + payment page link', required: true },
  { id: 'pay_test_card', what: 'pay it with a BOG test card', pass: 'receipt status completed', required: true },
  { id: 'callback_signature', what: 'the callback BOG sends', pass: 'signature verifies with the sandbox key', required: true },
  { id: 'fulfil_once', what: 'settle the order', pass: 'exactly one wallet top-up row for bog:<order>', required: true },
  { id: 'callback_replay', what: 'send the same callback again', pass: 'no second top-up; balance unchanged', required: true },
  { id: 'forged_callback', what: 'a callback with a bad signature', pass: 'HTTP 401, nothing credited', required: true },
  { id: 'amount_mismatch', what: 'a receipt whose amount differs from our row', pass: 'order flagged amount_mismatch, nothing credited', required: true },
  { id: 'lost_callback_cron', what: 'pay with the callback blocked, then run the cron', pass: 'cron settles from the receipt, once', required: true },
  { id: 'decline', what: 'a declining test card', pass: 'order rejected, nothing credited', required: true },
  { id: 'refund', what: 'refund the paid order in the sandbox', pass: 'status completed → refund_requested/refunded, one way only', required: true },
  { id: 'limits', what: 'an order above the per-payment limit', pass: '400 BOG_LIMIT before BOG is asked', required: true },
  { id: 'saved_card_renewal', what: 'a plan, then a renewal on the saved card', pass: 'one charge per period; Idempotency-Key reused on retry', required: 'if_auto_payments' },
];

export interface CertEvidence { step: CertStepId; passed: boolean; detail: string; at: string }

export interface CertResult {
  certified: boolean;
  environment: 'sandbox' | 'other';
  passed: CertStepId[];
  failed: CertStepId[];
  missing: CertStepId[];
}

/** Score one run. The latest evidence for a step wins (a re-run of one step replaces its earlier result). */
export function certify(env: string | undefined, evidence: readonly CertEvidence[], opts: { autoPayments: boolean }): CertResult {
  const environment = (env ?? '').trim().toLowerCase() === 'sandbox' ? 'sandbox' : 'other';
  const last = new Map<CertStepId, CertEvidence>();
  for (const e of [...evidence].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) last.set(e.step, e);
  const required = BOG_CERT_STEPS.filter((s) => s.required === true || (s.required === 'if_auto_payments' && opts.autoPayments)).map((s) => s.id);
  const passed = required.filter((id) => last.get(id)?.passed === true);
  const failed = required.filter((id) => last.get(id)?.passed === false);
  const missing = required.filter((id) => !last.has(id));
  return { certified: environment === 'sandbox' && failed.length === 0 && missing.length === 0, environment, passed, failed, missing };
}
