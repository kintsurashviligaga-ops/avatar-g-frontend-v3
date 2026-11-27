/** @jest-environment node */
/** Draft price rows (GG 2026-11-13 13:06Z): all unapproved, all at the owner's rule, no overlaps once approved. */
import { ECON, profitOverCostOf, usdToCostGel } from '@/lib/credits/unitEconomics';
import { DRAFT_VALID_FROM, VERTEX_PRICING_URL, draftInsertSql, priceDrafts, ruleCreditsPerUnit } from './priceDrafts';
import { activeVersion, bookProblems, keyOf, rowProblem } from './priceVersions';

const drafts = priceDrafts();
const NOW = '2026-11-20T00:00:00Z';

test('every draft is unapproved, so none of them prices anything yet', () => {
  expect(drafts.length).toBeGreaterThan(30);
  for (const r of drafts) {
    expect(r.approvedBy).toBeNull();
    expect(rowProblem(r)).toBe('not approved');
    expect(activeVersion(drafts, r, NOW)).toEqual({ ok: false, error: 'no_price' });
  }
});

test('approved one by one, each draft passes every row rule, including the 100 % profit rule', () => {
  for (const r of drafts) {
    const approved = { ...r, approvedBy: 'GG' };
    expect([r.id, rowProblem(approved)]).toEqual([r.id, null]);
    expect(r.sourceUrl).toBe(VERTEX_PRICING_URL);
    expect(r.id).toMatch(/^pv_[a-z0-9_]{2,60}$/); // the SQL id check
    // the smallest such value: one ten-thousandth less breaks the rule
    const less = Math.round((r.creditsPerUnit - 1e-4) * 1e4) / 1e4;
    expect(profitOverCostOf(less, usdToCostGel(r.usdPerUnit))).toBeLessThan(ECON.profitOverCost);
  }
});

test('ids and keys are unique, so approving all of them never makes an overlap', () => {
  expect(new Set(drafts.map((r) => r.id)).size).toBe(drafts.length);
  expect(new Set(drafts.map(keyOf)).size).toBe(drafts.length);
  const all = drafts.map((r) => ({ ...r, approvedBy: 'GG' }));
  expect(bookProblems(all)).toEqual([]);
  for (const r of all) expect(activeVersion(all, r, NOW)).toMatchObject({ ok: true, row: { id: r.id } });
  expect(activeVersion(all, drafts[0]!, '2026-11-12T23:59:59Z')).toEqual({ ok: false, error: 'no_price' }); // before DRAFT_VALID_FROM
  expect(DRAFT_VALID_FROM).toBe('2026-11-13T00:00:00Z');
});

test('full billed prices, never the after-credits promo price, and no promo rows', () => {
  const by = (id: string) => drafts.find((r) => r.id === id)!;
  expect(by('pv_text_38flash_in').usdPerUnit).toBe(1.5);
  expect(by('pv_text_38flash_out').usdPerUnit).toBe(7.5);
  expect(by('pv_tts_38flash_out').usdPerUnit).toBe(18);
  expect(by('pv_text_argon_out').usdPerUnit).toBe(20);
  expect(drafts.every((r) => !r.promo && r.validTo === null)).toBe(true);
});

test('rule credits per unit: a known case, and monotonic in cost', () => {
  // $1 → 2.7 ₾ × 1.05 = 2.835 ₾ cost; price p with p − 0.03p − 2.835 = 2.835 + 0.03p → p = 5.67 / 0.94 = 6.0319 ₾ → 60.3192 credits
  expect(ruleCreditsPerUnit(1)).toBeCloseTo(60.3192, 4);
  expect(ruleCreditsPerUnit(2)).toBeGreaterThan(ruleCreditsPerUnit(1));
});

test('the review SQL inserts drafts only (no approver column), escapes quotes and is re-runnable', () => {
  const sql = draftInsertSql(drafts);
  expect(sql).not.toMatch(/approved_by|approved_at/);
  expect(sql).toMatch(/on conflict \(id\) do nothing;$/);
  expect(sql.match(/\('pv_/g)?.length).toBe(drafts.length);
  expect(draftInsertSql([{ ...drafts[0]!, model: "o'k" }])).toContain("'o''k'");
});
