/** @jest-environment node */
/** BOG 13-check scorecard: BLOCKED until the sandbox pair exists, never "passed" by a skipped job. */
import { BOG_CERT_STEPS, type CertEvidence } from './bogCertification';
import { SCORECARD_SOURCES, scorecard } from './bogScorecard';

const at = (i: number) => new Date(Date.UTC(2026, 10, 20, 10, i)).toISOString();
const allPass = (): CertEvidence[] => BOG_CERT_STEPS.map((s, i) => ({ step: s.id, passed: true, detail: 'ok', at: at(i) }));

test('today: no sandbox pair → 12 BLOCKED + renewal not required, not certified', () => {
  const r = scorecard('sandbox', [], { havePair: false, autoPayments: false });
  expect(r.rows).toHaveLength(13);
  expect(r.summary).toEqual({ PASS: 0, FAIL: 0, BLOCKED: 12, NOT_REQUIRED: 1 });
  expect(r.certified).toBe(false);
  expect(r.rows.find((x) => x.step === 'oauth')!.detail).toMatch(/BOG_SANDBOX_CLIENT_ID/);
});

test('every check names where its evidence comes from', () => {
  for (const s of BOG_CERT_STEPS) expect(SCORECARD_SOURCES[s.id].length).toBeGreaterThan(0);
});

test('a full sandbox run certifies; renewal counts once automatic payments are on', () => {
  expect(scorecard('sandbox', allPass(), { havePair: true, autoPayments: true })).toMatchObject({ certified: true, summary: { PASS: 13 } });
  const noRenewal = allPass().filter((e) => e.step !== 'saved_card_renewal');
  expect(scorecard('sandbox', noRenewal, { havePair: true, autoPayments: true }).certified).toBe(false);
  expect(scorecard('sandbox', noRenewal, { havePair: true, autoPayments: false }).certified).toBe(true);
});

test('evidence from anywhere but the sandbox counts for nothing', () => {
  const r = scorecard('production', allPass(), { havePair: true, autoPayments: true });
  expect(r.certified).toBe(false);
  expect(r.summary.PASS).toBe(0);
});

test('the latest result for a step wins, and callback checks say they need a public URL', () => {
  const ev: CertEvidence[] = [
    { step: 'decline', passed: true, detail: 'first', at: at(1) },
    { step: 'decline', passed: false, detail: 'rerun', at: at(2) },
  ];
  const r = scorecard('sandbox', ev, { havePair: true, autoPayments: false });
  expect(r.rows.find((x) => x.step === 'decline')).toMatchObject({ status: 'FAIL', detail: 'rerun' });
  expect(r.rows.find((x) => x.step === 'callback_signature')!.detail).toMatch(/public callback URL/);
});
