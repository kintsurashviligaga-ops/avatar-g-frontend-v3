/** @jest-environment node */
/** Versioned price book + quotes (v5.1 Phase 5, prepared, not wired). Prices here are TEST numbers, not real ones. */
import { activeVersion, bookProblems, priceBookMode, promoAlarms, rowProblem, type PriceVersion } from './priceVersions';
import { minuteEstimate, quote, textEstimate, timeoutBilledUsage, ttsEstimate, videoEstimate } from './quote';

const row = (over: Partial<PriceVersion> = {}): PriceVersion => ({
  id: 'pv_flash_out_1', capability: 'agent.text', model: 'gemini-3.8-flash', unit: 'output_mtok',
  usdPerUnit: 2, creditsPerUnit: 250, validFrom: '2026-11-01T00:00:00Z', validTo: null,
  sourceUrl: 'https://cloud.google.com/vertex-ai/generative-ai/pricing', fetchedAt: '2026-11-12T09:00:00Z',
  approvedBy: 'GG', promo: false, ...over,
});
const inRow = (over: Partial<PriceVersion> = {}) => row({ id: 'pv_flash_in_1', unit: 'input_mtok', usdPerUnit: 0.3, creditsPerUnit: 40, ...over });
const NOW = '2026-11-14T12:00:00Z';

test('a row is usable only with an https source, an approver, a sane window and credits at or above the 100 % rule', () => {
  expect(rowProblem(row())).toBeNull();
  expect(rowProblem(row({ approvedBy: null }))).toBe('not approved');
  expect(rowProblem(row({ approvedBy: '  ' }))).toBe('not approved');
  expect(rowProblem(row({ sourceUrl: 'http://x' }))).toMatch(/https/);
  expect(rowProblem(row({ usdPerUnit: 0 }))).toMatch(/usdPerUnit/);
  expect(rowProblem(row({ validTo: '2026-10-01T00:00:00Z' }))).toMatch(/after/);
  expect(rowProblem(row({ promo: true }))).toMatch(/end date/);
  // $2 → ₾5.67 with the FX reserve; at 100 % profit plus the card fee that needs ~120 credits. 100 is below the rule.
  expect(rowProblem(row({ creditsPerUnit: 100 }))).toMatch(/100 % profit/);
  expect(rowProblem(row({ creditsPerUnit: 121 }))).toBeNull();
});

test('active row: none → no_price (never free), two at once → overlap (fail closed), unusable rows ignored', () => {
  expect(activeVersion([row()], { capability: 'agent.text', model: 'gemini-3.8-flash', unit: 'output_mtok' }, NOW)).toMatchObject({ ok: true });
  expect(activeVersion([], { capability: 'agent.text', model: 'gemini-3.8-flash', unit: 'output_mtok' }, NOW)).toEqual({ ok: false, error: 'no_price' });
  expect(activeVersion([row({ approvedBy: null })], { capability: 'agent.text', model: 'gemini-3.8-flash', unit: 'output_mtok' }, NOW)).toEqual({ ok: false, error: 'no_price' });
  expect(activeVersion([row(), row({ id: 'pv2' })], { capability: 'agent.text', model: 'gemini-3.8-flash', unit: 'output_mtok' }, NOW)).toEqual({ ok: false, error: 'overlap' });
  // a price change: old row ends when the new one starts; each moment has exactly one
  const old = row({ validTo: '2026-11-20T00:00:00Z' });
  const next = row({ id: 'pv_flash_out_2', creditsPerUnit: 300, validFrom: '2026-11-20T00:00:00Z' });
  const key = { capability: 'agent.text', model: 'gemini-3.8-flash', unit: 'output_mtok' as const };
  expect(activeVersion([old, next], key, '2026-11-19T23:59:59Z')).toMatchObject({ row: { id: 'pv_flash_out_1' } });
  expect(activeVersion([old, next], key, '2026-11-20T00:00:00Z')).toMatchObject({ row: { id: 'pv_flash_out_2' } });
  expect(bookProblems([old, next])).toEqual([]);
  expect(bookProblems([row(), row({ id: 'pv2', validFrom: '2026-11-10T00:00:00Z' })])[0]).toMatch(/overlapping/);
  expect(bookProblems([row(), row()])[0]).toMatch(/duplicate id/);
});

test('promo alarms: 7 days ahead; critical when nothing follows the promo', () => {
  const promo = row({ id: 'pv_argon_promo', promo: true, validTo: '2026-11-30T00:00:00Z' });
  expect(promoAlarms([promo], '2026-11-20T00:00:00Z')).toEqual([]);
  expect(promoAlarms([promo], '2026-11-25T00:00:00Z')).toEqual([expect.objectContaining({ id: 'pv_argon_promo', daysLeft: 5, level: 'critical', successor: null })]);
  const after = row({ id: 'pv_argon_full', validFrom: '2026-11-30T00:00:00Z', creditsPerUnit: 500 });
  expect(promoAlarms([promo, after], '2026-11-25T00:00:00Z')[0]).toMatchObject({ level: 'warn', successor: 'pv_argon_full' });
});

test('a quote names its rows, rounds up, and reserves the worst case', () => {
  const est = textEstimate('agent.text', 'gemini-3.8-flash', { inputTokens: 10_000, expectedOutputTokens: 2_000, maxOutputTokens: 8_000, thinkingBudget: 2_000 });
  const q = quote([row(), inRow()], est, NOW);
  if (!q.ok) throw new Error(q.error);
  // expected: 0.01 M in × 40 + 0.002 M out × 250 = 0.4 + 0.5 = 0.9 → 1 credit; worst: 0.4 + 0.01 M × 250 = 2.9 → 3
  expect(q).toMatchObject({ credits: 1, maxCredits: 3, versionIds: ['pv_flash_in_1', 'pv_flash_out_1'], pricedAt: NOW });
  expect(q.usdWorst).toBeCloseTo(0.01 * 0.3 + 0.01 * 2, 6);
  // a unit with no price fails the whole quote (never a partial, cheaper price)
  expect(quote([row()], est, NOW)).toMatchObject({ ok: false });
});

test('worst-case builders: Argon/Carbon bill the full cap on timeout above 32K; video, TTS and minutes use their caps', () => {
  expect(timeoutBilledUsage('gemini-3.8-flash', { inputTokens: 1000, maxOutputTokens: 64_000 })).toBeNull();
  expect(timeoutBilledUsage('gemini-4-argon', { inputTokens: 1000, maxOutputTokens: 16_000 })).toBeNull();
  expect(timeoutBilledUsage('gemini-4-argon', { inputTokens: 1000, maxOutputTokens: 60_000, thinkingBudget: 4_000 })).toEqual({ input_mtok: 0.001, output_mtok: 0.064 });
  expect(videoEstimate('video', 'omni', { seconds: 4, maxSeconds: 10 }).worst).toEqual({ second: 10 });
  expect(ttsEstimate('tts', 'gemini-3.8-flash-tts', 1500)).toMatchObject({ expected: { kchar: 1.5 }, worst: { kchar: 1.5 } });
  expect(minuteEstimate('live', 'gemini-3.8-live', { expectedMinutes: 9, capMinutes: 5 })).toMatchObject({ expected: { minute: 5 }, worst: { minute: 5 } });
});

test('AGENT_PRICE_BOOK fails closed to off', () => {
  for (const v of [undefined, '', 'yes', 'ON ', 'Shadow']) expect(priceBookMode(v)).toBe(v === 'ON ' ? 'on' : v === 'Shadow' ? 'shadow' : 'off');
});
