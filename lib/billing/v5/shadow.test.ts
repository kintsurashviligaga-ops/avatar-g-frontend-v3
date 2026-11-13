/** @jest-environment node */
/** Shadow pricing (GG 13:06Z): logs book vs code, never changes the charge, never throws, never slows a call. */
import { priceDrafts } from './priceDrafts';
import { textEstimate } from './quote';
import { shadowPrice, shadowRecord, shadowSummary, type ShadowRecord } from './shadow';

const approved = priceDrafts().map((r) => ({ ...r, approvedBy: 'GG' }));
const est = textEstimate('text', 'gemini-3.8-flash', { inputTokens: 4000, expectedOutputTokens: 1000, maxOutputTokens: 8000 });
const NOW = new Date('2026-11-20T10:00:00Z');

test('off (and any unknown value) reads nothing and logs nothing', async () => {
  for (const mode of [undefined, '', 'off', 'ON ', 'yes', 'on']) {
    const loadBook = jest.fn(async () => approved);
    const log = jest.fn();
    await shadowPrice(mode, est, 3, { loadBook, log });
    expect(loadBook).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  }
});

test('shadow logs the difference against the book', async () => {
  const log = jest.fn();
  await expect(shadowPrice('shadow', est, 1, { loadBook: async () => approved, log, now: () => NOW })).resolves.toBeUndefined();
  const rec: ShadowRecord = log.mock.calls[0][0];
  expect(rec).toMatchObject({ capability: 'text', model: 'gemini-3.8-flash', codeCredits: 1, error: null, at: NOW.toISOString() });
  expect(rec.bookCredits).toBeGreaterThan(0);
  expect(rec.bookMaxCredits).toBeGreaterThanOrEqual(rec.bookCredits!);
  expect(rec.diff).toBe(rec.bookCredits! - 1);
  expect(rec.versionIds).toEqual(['pv_text_38flash_in', 'pv_text_38flash_out']);
});

test('drafts only (nothing approved) → logged as no_price, never as a free call', () => {
  const rec = shadowRecord(est, 2, priceDrafts(), NOW.toISOString());
  expect(rec).toMatchObject({ bookCredits: null, diff: null, error: 'text/gemini-3.8-flash/input_mtok: no_price' });
});

test('a failing or slow book, or a failing log, never throws and never blocks', async () => {
  const log = jest.fn();
  await shadowPrice('shadow', est, 2, { loadBook: async () => { throw new Error('db down'); }, log });
  expect(log.mock.calls[0][0]).toMatchObject({ error: 'db down', bookCredits: null });
  const t0 = Date.now();
  await shadowPrice('shadow', est, 2, { loadBook: () => new Promise(() => {}), log, timeoutMs: 30 });
  expect(Date.now() - t0).toBeLessThan(500);
  expect(log.mock.calls[1][0]).toMatchObject({ error: 'timeout' });
  await expect(shadowPrice('shadow', est, 2, { loadBook: async () => approved, log: () => { throw new Error('log down'); } })).resolves.toBeUndefined();
});

test('summary: per capability, mean and worst difference, failures counted', () => {
  const r = (diffPct: number | null, error: string | null = null): ShadowRecord => ({
    at: '', capability: 'text', model: 'm', codeCredits: 10, bookCredits: null, bookMaxCredits: null, diff: null, diffPct, versionIds: [], error,
  });
  expect(shadowSummary([r(0.1), r(-0.3), r(null, 'no_price')])).toEqual([
    { key: 'text|m', calls: 3, failed: 1, meanDiffPct: -0.1, worstDiffPct: -0.3, errors: ['no_price'] },
  ]);
});
