/** @jest-environment node */
/**
 * lib/billing/bogLimits — BOG's 24 h / 30 day limits: what counts, rolling windows (safe under the bank's calendar
 * days), when there is room again, and failing closed when the orders cannot be read.
 */
jest.mock('server-only', () => ({}));
// bogSettlement is imported only for its refund-status list; its money and bank dependencies stay out of this test.
jest.mock('./wallet-ledger', () => ({}));
jest.mock('./bogClient', () => ({}));

import { fakeSupabase, type FakeCall } from './__testing__/fakeSupabase';
import { BOG_IN_FLIGHT_MS, BOG_PAID_STATUSES, bogLimits, checkBogLimits, type BogLimits } from './bogLimits';
import { BOG_REFUND_STATUSES } from './bogSettlement';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const H = 3600_000;
const D = 24 * H;
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MERCHANT: BogLimits = { singleTransaction: 500, per24h: 1000, per30d: 5000, scope: 'merchant' };

function db(rows: { paid?: unknown[]; open?: unknown[]; error?: unknown }) {
  const f = fakeSupabase((c: FakeCall) => {
    if (rows.error) return { error: rows.error };
    const openQuery = c.filters.some((x) => x[0] === 'eq' && x[1] === 'status' && x[2] === 'pending');
    return { data: openQuery ? (rows.open ?? []) : (rows.paid ?? []) };
  });
  return f;
}
const check = (rows: Parameters<typeof db>[0], amountGel: number, limits = MERCHANT) =>
  checkBogLimits(db(rows).client, { userId: 'u1', amountGel, limits, nowMs: NOW });

describe('bogLimits(env)', () => {
  test('the bank letter’s figures, merchant-wide, when nothing is set', () => {
    expect(bogLimits({})).toEqual({ singleTransaction: 500, per24h: 1000, per30d: 5000, scope: 'merchant' });
  });
  test('env raises or lowers them; an unreadable, zero, negative or absurd value keeps the letter’s figure', () => {
    expect(bogLimits({ BOG_LIMIT_24H_GEL: '2500', BOG_LIMIT_30D_GEL: ' 20000 ', BOG_LIMIT_PER_PAYMENT_GEL: '300' })).toMatchObject({
      singleTransaction: 300,
      per24h: 2500,
      per30d: 20000,
    });
    for (const bad of ['', 'abc', '0', '-5', '1O00', 'Infinity', '9999999999']) {
      expect(bogLimits({ BOG_LIMIT_24H_GEL: bad }).per24h).toBe(1000);
    }
  });
  test('BOG_LIMIT_SCOPE=customer switches scope; anything else is merchant', () => {
    expect(bogLimits({ BOG_LIMIT_SCOPE: 'Customer' }).scope).toBe('customer');
    expect(bogLimits({ BOG_LIMIT_SCOPE: 'card' }).scope).toBe('merchant');
  });
  test('paid statuses = completed + every refund status + amount_mismatch', () => {
    expect([...BOG_PAID_STATUSES]).toEqual(['completed', ...BOG_REFUND_STATUSES, 'amount_mismatch']);
  });
});

describe('checkBogLimits', () => {
  test('room left: ok, with what is used in each window (tetri-exact, no float noise)', async () => {
    const paid = [
      { amount_gel: '0.10', created_at: at(H), credited_at: at(H) },
      { amount_gel: '0.20', created_at: at(2 * H), credited_at: null },
      { amount_gel: 100, created_at: at(3 * D), credited_at: at(3 * D) },
    ];
    expect(await check({ paid }, 10)).toEqual({ ok: true, used24hGel: 0.3, used30dGel: 100.3 });
  });

  test('"at most": exactly the limit fits, a tetri more does not', async () => {
    const paid = [{ amount_gel: 990, created_at: at(H), credited_at: at(H) }];
    expect((await check({ paid }, 10)).ok).toBe(true);
    expect(await check({ paid }, 10.01)).toMatchObject({ ok: false, window: '24h', limitGel: 1000, usedGel: 990 });
  });

  test('the window is rolling and timed by when the payment was credited: credited 25 h ago no longer counts for 24 h', async () => {
    const paid = [{ amount_gel: 990, created_at: at(26 * H), credited_at: at(25 * H) }];
    expect(await check({ paid }, 50)).toEqual({ ok: true, used24hGel: 0, used30dGel: 990 });
  });

  test('availableAt: the moment enough paid money leaves the window (oldest first)', async () => {
    const paid = [
      { amount_gel: 400, created_at: at(20 * H), credited_at: at(20 * H) },
      { amount_gel: 500, created_at: at(10 * H), credited_at: at(10 * H) },
      { amount_gel: 80, created_at: at(H), credited_at: at(H) },
    ];
    // used 980; 50 more needs 30 freed → the 400 from 20 h ago leaves 4 h from now
    expect(await check({ paid }, 50)).toMatchObject({ ok: false, window: '24h', availableAt: new Date(NOW - 20 * H + D).toISOString() });
    // 450 more needs 430 freed → the 400 and then the 500 (10 h ago) must leave
    expect(await check({ paid }, 450)).toMatchObject({ availableAt: new Date(NOW - 10 * H + D).toISOString() });
  });

  test('an amount above the limit itself never fits: availableAt null', async () => {
    expect(await check({}, 1200)).toMatchObject({ ok: false, window: '24h', availableAt: null });
  });

  test('both windows full → the later of the two is reported (room comes only when both have it)', async () => {
    const paid = [
      { amount_gel: 995, created_at: at(H), credited_at: at(H) },
      ...Array.from({ length: 8 }, (_, i) => ({ amount_gel: 500, created_at: at((i + 2) * 3 * D), credited_at: at((i + 2) * 3 * D) })),
    ];
    const r = await check({ paid }, 10);
    expect(r).toMatchObject({ ok: false, window: '30d' });
    if (r.ok || r.window === 'unknown') throw new Error('expected a refusal');
    expect(Date.parse(r.availableAt!)).toBeGreaterThan(NOW + D);
  });

  test('this customer’s open checkouts count while BOG’s page can still be paid; their page’s death frees them', async () => {
    const paid = [{ amount_gel: 950, created_at: at(H), credited_at: at(H) }];
    const open = [{ amount_gel: 40, created_at: at(10 * 60_000) }];
    const r = await check({ paid, open }, 20);
    expect(r).toMatchObject({ ok: false, window: '24h', usedGel: 990, availableAt: new Date(NOW - 10 * 60_000 + BOG_IN_FLIGHT_MS).toISOString() });
  });

  test('the open-checkout query is this customer’s only, pending checkouts younger than the page lifetime; paid is everyone’s in merchant scope', async () => {
    const f = db({});
    await checkBogLimits(f.client, { userId: 'u1', amountGel: 5, limits: MERCHANT, nowMs: NOW });
    const [paidQ, openQ] = f.log;
    expect(paidQ?.filters).toEqual(expect.arrayContaining([['in', 'status', [...BOG_PAID_STATUSES]], ['gte', 'created_at', at(31 * D)]]));
    expect(paidQ?.filters.some((x) => x[1] === 'user_id')).toBe(false);
    expect(openQ?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'user_id', 'u1'],
        ['eq', 'status', 'pending'],
        ['in', 'kind', ['topup', 'subscription']],
        ['gte', 'created_at', at(BOG_IN_FLIGHT_MS)],
      ]),
    );
    const g = db({});
    await checkBogLimits(g.client, { userId: 'u1', amountGel: 5, limits: { ...MERCHANT, scope: 'customer' }, nowMs: NOW });
    expect(g.log[0]?.filters).toEqual(expect.arrayContaining([['eq', 'user_id', 'u1']]));
  });

  test('fails closed: unreadable table, a garbled row, too many rows, or a bad amount → unknown', async () => {
    expect(await check({ error: { message: 'timeout' } }, 10)).toEqual({ ok: false, window: 'unknown' });
    expect(await check({ paid: [{ amount_gel: 'x', created_at: at(H), credited_at: null }] }, 10)).toEqual({ ok: false, window: 'unknown' });
    expect(await check({ paid: Array.from({ length: 2000 }, () => ({ amount_gel: 1, created_at: at(H), credited_at: null })) }, 10)).toEqual({
      ok: false,
      window: 'unknown',
    });
    expect(await check({}, Number.NaN)).toEqual({ ok: false, window: 'unknown' });
  });
});

/**
 * The bank's answer of 2026-10-15: the 1,000 ₾ and 5,000 ₾ limits count CALENDAR days ("24 hours" = a calendar day,
 * "30 calendar days"), merchant-wide; the 500 ₾ is per payment. We keep rolling windows: a rolling 24 h window always
 * contains everything paid since the last midnight, and a rolling 30 × 24 h window everything since midnight 29 days
 * ago — in any time zone without daylight saving (Georgia and UTC have none). So what rolling admits never breaks a
 * calendar limit; it can only wait longer than the bank would.
 */
describe('rolling windows never break the bank’s calendar-day limits (bank answer, 2026-10-15)', () => {
  const TBILISI = 4 * H;
  const dayOf = (ms: number, offset: number) => Math.floor((ms + offset) / D);

  /** Deterministic pseudo-random numbers (mulberry32), so a failure reproduces. */
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The letter's limits (the 30-day one binds first), and a raised 30-day limit so the daily one is pressed too.
  const RAISED: BogLimits = { ...MERCHANT, per30d: 30_000 };
  test.each([
    [1, MERCHANT],
    [2, MERCHANT],
    [3, MERCHANT],
    [4, RAISED],
    [5, RAISED],
    [6, RAISED],
  ])('random payments over 90 days (seed %i, %j): every calendar day and every 30 calendar days stay inside, Tbilisi and UTC', async (seed, limits) => {
    const rand = rng(seed);
    const start = Date.parse('2026-08-01T00:00:00Z');
    const paid: Array<{ amount_gel: number; created_at: string; credited_at: string; t: number }> = [];
    let t = start;
    let refused = 0;
    while (t < start + 90 * D) {
      t += Math.floor(rand() * 9 * H) + 60_000; // the next attempt: a minute to 9 hours later
      const amount = Math.round((5 + rand() * 495) * 100) / 100; // 5 … 500 ₾, tetri
      const verdict = await checkBogLimits(db({ paid }).client, { userId: 'u', amountGel: amount, limits, nowMs: t });
      if (verdict.ok) {
        const iso = new Date(t).toISOString();
        paid.push({ amount_gel: amount, created_at: iso, credited_at: iso, t });
      } else {
        expect(verdict.window).not.toBe('unknown');
        refused += 1;
      }
    }
    expect(paid.length).toBeGreaterThan(50);
    expect(refused).toBeGreaterThan(10); // the limits were actually pressed against
    let fullDays = 0;
    for (const offset of [TBILISI, 0]) {
      const byDay = new Map<number, number>();
      for (const p of paid) byDay.set(dayOf(p.t, offset), (byDay.get(dayOf(p.t, offset)) ?? 0) + Math.round(p.amount_gel * 100));
      for (const tetri of byDay.values()) {
        expect(tetri).toBeLessThanOrEqual(limits.per24h * 100);
        if (tetri > limits.per24h * 100 * 0.8) fullDays += 1;
      }
      const days = [...byDay.keys()];
      for (let d = Math.min(...days); d <= Math.max(...days); d += 1) {
        let sum = 0;
        for (let k = d - 29; k <= d; k += 1) sum += byDay.get(k) ?? 0;
        expect(sum).toBeLessThanOrEqual(limits.per30d * 100);
      }
    }
    // With the raised 30-day limit, days really do come close to the daily one.
    if (limits.per30d > 5000) expect(fullDays).toBeGreaterThan(10);
  });

  test('the price of being safe: 900 ₾ at 22:30 Tbilisi, then 200 ₾ at 01:00 — the bank (new calendar day) would take it, we wait until 22:30', async () => {
    const paidAt = Date.parse('2026-10-14T18:30:00Z'); // 22:30 in Tbilisi
    const now = Date.parse('2026-10-14T21:00:00Z'); // 01:00 on the 15th in Tbilisi
    const iso = new Date(paidAt).toISOString();
    const r = await checkBogLimits(db({ paid: [{ amount_gel: 900, created_at: iso, credited_at: iso }] }).client, {
      userId: 'u',
      amountGel: 200,
      limits: MERCHANT,
      nowMs: now,
    });
    expect(r).toEqual({ ok: false, window: '24h', limitGel: 1000, usedGel: 900, availableAt: '2026-10-15T18:30:00.000Z' });
  });
});
