/**
 * The reference-selection policy: the dropzone takes 40 photos, an engine takes a few, and WHICH few is a documented,
 * deterministic rule (role pass, then the user's order). These tests pin the rule, because the panel promises
 * "Using 3 of 12" before the user pays and the server must give the engine exactly those.
 */
import { countByRole, selectReferences } from './selection';
import type { ReferenceRole } from './types';

type Item = { id: string; role: ReferenceRole };
const it = (id: string, role: ReferenceRole): Item => ({ id, role });
const ids = (xs: readonly Item[]) => xs.map((x) => x.id);

test('one best photo per role comes first, in the order character → product → wardrobe', () => {
  const items = [it('w1', 'wardrobe'), it('p1', 'product'), it('c1', 'character'), it('c2', 'character')];
  const s = selectReferences(items, 3);
  expect(ids(s.used)).toEqual(['c1', 'p1', 'w1']);
  expect(ids(s.skipped)).toEqual(['c2']);
});

test('"best" within a role is the user\'s own first — reordering is how they choose', () => {
  const a = selectReferences([it('c1', 'character'), it('c2', 'character')], 1);
  const b = selectReferences([it('c2', 'character'), it('c1', 'character')], 1);
  expect(ids(a.used)).toEqual(['c1']);
  expect(ids(b.used)).toEqual(['c2']);
});

test('room left after the role pass is filled in the user\'s order, whatever the role', () => {
  const items = [it('c1', 'character'), it('c2', 'character'), it('c3', 'character'), it('p1', 'product')];
  const s = selectReferences(items, 3);
  // role pass: c1, p1 — fill pass: c2 (the next in the user's order)
  expect(ids(s.used)).toEqual(['c1', 'p1', 'c2']);
  expect(ids(s.skipped)).toEqual(['c3']);
});

test('an engine that takes ONE photo (Kling Motion Control) gets the first character photo', () => {
  const items = [it('p1', 'product'), it('c1', 'character'), it('c2', 'character')];
  expect(ids(selectReferences(items, 1).used)).toEqual(['c1']);
});

test('with no character photo the role pass moves on to the next role present', () => {
  expect(ids(selectReferences([it('w1', 'wardrobe'), it('p1', 'product')], 1).used)).toEqual(['p1']);
});

test('never more than the cap — and never more than there are', () => {
  const forty = Array.from({ length: 40 }, (_, i) => it(`c${i}`, i % 3 === 0 ? 'character' : i % 3 === 1 ? 'product' : 'wardrobe'));
  const s = selectReferences(forty, 3);
  expect(s.used).toHaveLength(3);
  expect(s.skipped).toHaveLength(37);
  expect(s.total).toBe(40);
  expect(s.cap).toBe(3);
  expect(selectReferences([it('c1', 'character')], 3).used).toHaveLength(1);
  expect(selectReferences([], 3).used).toEqual([]);
});

test('used + skipped is exactly the input, each photo once', () => {
  const items = Array.from({ length: 12 }, (_, i) => it(`i${i}`, (['character', 'product', 'wardrobe'] as const)[i % 3]!));
  const s = selectReferences(items, 5);
  expect([...ids(s.used), ...ids(s.skipped)].sort()).toEqual(ids(items).sort());
  expect(new Set(ids(s.used)).size).toBe(s.used.length);
});

test('deterministic: the same input always gives the same selection', () => {
  const items = Array.from({ length: 20 }, (_, i) => it(`i${i}`, (['wardrobe', 'character', 'product'] as const)[(i * 7) % 3]!));
  const first = ids(selectReferences(items, 3).used);
  for (let n = 0; n < 5; n++) expect(ids(selectReferences(items, 3).used)).toEqual(first);
});

test('re-ordering photos the engine does NOT use never changes what it receives', () => {
  const items = [it('c1', 'character'), it('p1', 'product'), it('w1', 'wardrobe'), it('x1', 'character'), it('x2', 'product'), it('x3', 'wardrobe')];
  const base = ids(selectReferences(items, 3).used);
  const shuffled = [items[0]!, items[1]!, items[2]!, items[5]!, items[3]!, items[4]!];
  expect(ids(selectReferences(shuffled, 3).used)).toEqual(base);
});

test('a cap of 0, a negative one or a non-number selects nothing and says so', () => {
  const items = [it('c1', 'character')];
  for (const cap of [0, -2, Number.NaN]) {
    const s = selectReferences(items, cap);
    expect(s.used).toEqual([]);
    expect(s.skipped).toHaveLength(1);
    expect(s.cap).toBe(0);
  }
});

test('a fractional cap is floored — a "2.9 photos" engine takes 2', () => {
  const items = [it('c1', 'character'), it('p1', 'product'), it('w1', 'wardrobe')];
  expect(selectReferences(items, 2.9).used).toHaveLength(2);
});

test('countByRole counts each role', () => {
  expect(countByRole([it('a', 'character'), it('b', 'character'), it('c', 'wardrobe')])).toEqual({ character: 2, product: 0, wardrobe: 1 });
});
