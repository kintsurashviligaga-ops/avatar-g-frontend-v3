/** @jest-environment node */
/** Daily reconciliation and the BOG sandbox certification checklist (v5.1 Phase 5, prepared, not wired). */
import { BOG_CERT_STEPS, certify, type CertEvidence } from './bogCertification';
import { reconcileDay } from './reconcile';

test('reconcile: per-capability drift, unlabeled spend, noise below $0.50 ignored, other days ignored', () => {
  const r = reconcileDay('2026-11-14', [
    { day: '2026-11-14', cap: 'video', usd: 10 },
    { day: '2026-11-14', cap: 'tts', usd: 0.2 },
    { day: '2026-11-14', cap: null, usd: 1.5 },
    { day: '2026-11-13', cap: 'video', usd: 99 },
  ], [
    { day: '2026-11-14', capability: 'video', usd: 8 },
    { day: '2026-11-14', capability: 'tts', usd: 0.1 },
    { day: '2026-11-14', capability: 'agent.text', usd: 0.3 },
  ]);
  expect(r.lines.map((l) => l.capability)).toEqual(['agent.text', 'tts', 'video']);
  expect(r.lines.find((l) => l.capability === 'video')).toMatchObject({ billedUsd: 10, recordedUsd: 8, drift: 0.2 });
  expect(r.alarms).toEqual([expect.stringMatching(/^video: .*20 % drift/), expect.stringMatching(/\$1\.50 of spend has no capability label/)]);
  expect(r.billedUsd).toBeCloseTo(11.7, 6);
  expect(r.recordedUsd).toBeCloseTo(8.4, 6);
  expect(() => reconcileDay('14/11', [], [])).toThrow();
});

const all = (passed = true): CertEvidence[] => BOG_CERT_STEPS.map((s, i) => ({ step: s.id, passed, detail: 'x', at: `2026-11-20T10:${String(i).padStart(2, '0')}:00Z` }));

test('BOG certification: every required step must pass, in the sandbox', () => {
  expect(certify('sandbox', all(), { autoPayments: true })).toMatchObject({ certified: true, failed: [], missing: [] });
  expect(certify('production', all(), { autoPayments: true })).toMatchObject({ certified: false, environment: 'other' });
  const noRenewal = all().filter((e) => e.step !== 'saved_card_renewal');
  expect(certify('sandbox', noRenewal, { autoPayments: false }).certified).toBe(true);
  expect(certify('sandbox', noRenewal, { autoPayments: true })).toMatchObject({ certified: false, missing: ['saved_card_renewal'] });
  // a failed replay check fails the run; re-running that step later replaces it
  const ev = [...all(), { step: 'callback_replay' as const, passed: false, detail: 'second top-up', at: '2026-11-20T11:00:00Z' }];
  expect(certify('sandbox', ev, { autoPayments: false })).toMatchObject({ certified: false, failed: ['callback_replay'] });
  ev.push({ step: 'callback_replay', passed: true, detail: 'fixed', at: '2026-11-20T12:00:00Z' });
  expect(certify('sandbox', ev, { autoPayments: false }).certified).toBe(true);
});
