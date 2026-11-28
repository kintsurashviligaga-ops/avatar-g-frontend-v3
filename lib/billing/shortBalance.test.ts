/** Phase 8.25 — the top-up sheet says why it opened when a balance is short. */
import { openTopUpShort, parseShortBalance, shortBalanceCopy } from './shortBalance';

test('only an insufficient reason is a short balance; numbers are sanitised', () => {
  expect(parseShortBalance(undefined)).toBeNull();
  expect(parseShortBalance('login')).toBeNull();
  expect(parseShortBalance({ reason: 'other' })).toBeNull();
  expect(parseShortBalance({ reason: 'insufficient', needed: 28, balance: 0 })).toEqual({ reason: 'insufficient', needed: 28, balance: 0 });
  expect(parseShortBalance({ reason: 'insufficient', needed: -5, balance: Number.NaN })).toEqual({ reason: 'insufficient' });
  expect(parseShortBalance({ reason: 'insufficient', needed: 27.6 })).toEqual({ reason: 'insufficient', needed: 28 });
});

test('zero balance and a ✦28 video: Georgian names both numbers, the gap, and that nothing was charged', () => {
  const c = shortBalanceCopy({ reason: 'insufficient', needed: 28, balance: 0 }, 'ka');
  expect(c.title).toBe('კრედიტი არ გყოფნის');
  expect(c.body).toContain('✦28');
  expect(c.body).toContain('✦0');
  expect(c.body).toContain('აკლია ✦28');
  expect(c.body).toContain('თანხა არ ჩამოგეჭრა');
});

test('unknown numbers fall back to a plain sentence in every language', () => {
  for (const l of ['ka', 'en', 'ru']) {
    const c = shortBalanceCopy({ reason: 'insufficient' }, l);
    expect(c.title.length).toBeGreaterThan(3);
    expect(c.body).not.toContain('✦');
  }
  // needed <= balance is not "short": no numbers are claimed.
  expect(shortBalanceCopy({ reason: 'insufficient', needed: 5, balance: 9 }, 'en').body).not.toContain('✦');
});

test('openTopUpShort dispatches the open-credits event with the reason', () => {
  const seen: unknown[] = [];
  const on = (e: Event) => seen.push((e as CustomEvent).detail);
  window.addEventListener('myavatar:open-credits', on);
  openTopUpShort({ needed: 42, balance: 10 });
  window.removeEventListener('myavatar:open-credits', on);
  expect(seen).toEqual([{ reason: 'insufficient', needed: 42, balance: 10 }]);
});
