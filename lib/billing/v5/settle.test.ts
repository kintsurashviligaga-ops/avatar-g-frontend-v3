/** @jest-environment node */
/** Reserve the worst case, settle the truth (v5.1 Phase 5, prepared, not wired), over a fake canonical ledger. */
import type { PriceVersion } from './priceVersions';
import { quote, textEstimate, type Quote } from './quote';
import { reserve, settle, settlementOf, type CostPort, type LedgerPort } from './settle';

const base = { capability: 'agent.text', model: 'gemini-3.8-flash', validFrom: '2026-11-01T00:00:00Z', validTo: null, sourceUrl: 'https://cloud.google.com/vertex-ai/generative-ai/pricing', fetchedAt: '2026-11-12T09:00:00Z', approvedBy: 'GG', promo: false } as const;
const BOOK: PriceVersion[] = [
  { ...base, id: 'pv_in', unit: 'input_mtok', usdPerUnit: 0.3, creditsPerUnit: 40 },
  { ...base, id: 'pv_out', unit: 'output_mtok', usdPerUnit: 2, creditsPerUnit: 250 },
];
const NOW = '2026-11-14T12:00:00Z';
function q(): Quote {
  const r = quote(BOOK, textEstimate('agent.text', 'gemini-3.8-flash', { inputTokens: 100_000, expectedOutputTokens: 20_000, maxOutputTokens: 80_000 }), NOW);
  if (!r.ok) throw new Error(r.error);
  return r; // expected 4 + 5 = 9; worst 4 + 20 = 24
}

function fakeLedger(balance = 100) {
  const rows: { ref: string; delta: number }[] = [];
  const state = { balance };
  const ledger: LedgerPort = {
    async debitOnce(_u, amount, ref) {
      if (rows.some((r) => r.ref === ref)) return { ok: true, replay: true };
      if (state.balance < amount) return { ok: false, reason: 'insufficient' };
      rows.push({ ref, delta: -amount }); state.balance -= amount; return { ok: true };
    },
    async refundOnce(_u, amount, ref) {
      if (!rows.some((r) => r.ref === ref)) { rows.push({ ref, delta: amount }); state.balance += amount; }
      return { ok: true };
    },
    async netDebited(_u, ref) { return -rows.filter((r) => r.ref === ref).reduce((s, r) => s + r.delta, 0); },
  };
  const costRows: Parameters<CostPort['record']>[0][] = [];
  const costs: CostPort = { async record(row) { if (!costRows.some((c) => c.ref === row.ref)) costRows.push(row); return true; } };
  return { ledger, costs, rows, state, costRows };
}

test('quote: 9 credits expected, 24 held', () => { expect(q()).toMatchObject({ credits: 9, maxCredits: 24 }); });

test('success: pays actual (≤ hold), releases the rest, records the cost; a retried settle changes nothing', async () => {
  const w = fakeLedger();
  expect(await reserve(w.ledger, 'u1', 'run:r1:s1', q())).toEqual({ ok: true, held: 24, replay: false });
  const input = { userId: 'u1', ref: 'run:r1:s1', capability: 'agent.text', model: 'gemini-3.8-flash', quote: q(), outcome: { kind: 'success' as const, usage: { input_mtok: 0.1, output_mtok: 0.03 } }, book: BOOK };
  const s = await settle(w, input);
  expect(s).toMatchObject({ ok: true, settlement: { userCredits: 12, releaseCredits: 12, lossUsd: 0 } }); // 4 + 7.5 → 12
  expect(w.state.balance).toBe(88);
  await settle(w, input);
  expect(w.state.balance).toBe(88);
  expect(w.costRows).toHaveLength(1);
  // a replayed reserve does not hold twice
  expect(await reserve(w.ledger, 'u1', 'run:r1:s1', q())).toMatchObject({ ok: true, replay: true });
  expect(w.state.balance).toBe(88);
});

test('usage above the quote: the user pays the hold, the excess is our loss', () => {
  const s = settlementOf(BOOK, 'agent.text', 'gemini-3.8-flash', q(), { kind: 'success', usage: { input_mtok: 0.1, output_mtok: 0.2 } });
  expect(s.userCredits).toBe(24);
  expect(s.releaseCredits).toBe(0);
  expect(s.lossReason).toBe('over_quote');
  expect(s.lossUsd).toBeGreaterThan(0);
});

test('Google failures never cost the user (D-15); a billed one is recorded as our loss', () => {
  expect(settlementOf(BOOK, 'agent.text', 'gemini-3.8-flash', q(), { kind: 'provider_error', billed: false })).toEqual({ userCredits: 0, releaseCredits: 24, costUsd: 0, lossUsd: 0, lossReason: null });
  const billed = settlementOf(BOOK, 'agent.text', 'gemini-3.8-flash', q(), { kind: 'provider_error', billed: true, billedUsage: { input_mtok: 0.1, output_mtok: 0.08 }, reason: 'timeout after decode' });
  expect(billed).toMatchObject({ userCredits: 0, releaseCredits: 24, lossReason: 'google_billed_failure: timeout after decode' });
  expect(billed.lossUsd).toBeCloseTo(0.03 + 0.16, 6);
});

test('cancel pays the completed part only; unpriceable usage pays the shown price, never above the hold', () => {
  expect(settlementOf(BOOK, 'agent.text', 'gemini-3.8-flash', q(), { kind: 'cancelled', completedUsage: { input_mtok: 0.1 } })).toMatchObject({ userCredits: 4, releaseCredits: 20 });
  expect(settlementOf(BOOK, 'agent.text', 'gemini-3.8-flash', q(), { kind: 'success', usage: { second: 3 } })).toMatchObject({ userCredits: 9, releaseCredits: 15, lossReason: expect.stringMatching(/^unpriced_usage/) });
});

test('fail closed: no hold, a bad ref, an empty wallet or a broken ledger never let the provider run or move money', async () => {
  const w = fakeLedger(10);
  expect(await reserve(w.ledger, 'u1', 'run:r2:s1', q())).toEqual({ ok: false, error: 'insufficient' });
  expect(await reserve(w.ledger, 'u1', 'BAD REF', q())).toEqual({ ok: false, error: 'bad_ref' });
  const broken: LedgerPort = { ...w.ledger, debitOnce: async () => { throw new Error('db down'); } };
  expect(await reserve(broken, 'u1', 'run:r3:s1', q())).toEqual({ ok: false, error: 'ledger_unavailable' });
  const s = await settle(w, { userId: 'u1', ref: 'run:never:held', capability: 'agent.text', model: 'gemini-3.8-flash', quote: q(), outcome: { kind: 'provider_error', billed: false }, book: BOOK });
  expect(s).toEqual({ ok: false, error: 'no_hold' });
  expect(w.state.balance).toBe(10);
});

test('a release that fails is reported (retry later), and the cost row is not written yet', async () => {
  const w = fakeLedger();
  await reserve(w.ledger, 'u1', 'run:r4:s1', q());
  const flaky = { ...w, ledger: { ...w.ledger, refundOnce: async () => ({ ok: false }) } };
  const s = await settle(flaky, { userId: 'u1', ref: 'run:r4:s1', capability: 'agent.text', model: 'gemini-3.8-flash', quote: q(), outcome: { kind: 'provider_error', billed: false }, book: BOOK });
  expect(s).toMatchObject({ ok: false, error: 'release_failed' });
  expect(w.costRows).toHaveLength(0);
});
