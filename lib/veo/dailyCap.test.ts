/** @jest-environment node */
/**
 * The hard daily Veo ceiling (dailyCap.ts) against an in-memory store that keeps the Redis script's contract (read, compare,
 * add as one step) and a scripted ledger. What must hold: off unless VEO_DAILY_LIMIT_USD names a positive figure; a
 * reservation that would pass the figure is refused and adds nothing; racing reservations never pass the figure together;
 * the day is seeded once from the ledger; Redis down → the ledger decides; nothing readable → refused; a release gives
 * back exactly the reservation and never goes below zero.
 */
jest.mock('server-only', () => ({}));

import {
  releaseVeoSpend,
  reserveVeoSpend,
  setVeoCapDepsForTests,
  veoCapEnforced,
  veoCapRefusalDetail,
  veoCapStatus,
  veoDailyLimitUsd,
  veoDayKey,
  type VeoSpendStore,
} from './dailyCap';

const DAY = new Date('2026-10-15T15:30:00.000Z');
const ON = (limit: string) => ({ VEO_DAILY_LIMIT_USD: limit });

function memoryStore() {
  const counters = new Map<string, number>();
  let down = false;
  const calls: string[] = [];
  const store: VeoSpendStore = {
    async exists(day) { calls.push('exists'); return down ? null : counters.has(day); },
    async seed(day, micro) {
      calls.push(`seed:${micro}`);
      if (down) return null;
      if (counters.has(day)) return false;
      counters.set(day, micro);
      return true;
    },
    async reserve(day, micro, cap) {
      calls.push(`reserve:${micro}`);
      if (down) return null;
      // One step, like the Lua script: nothing can interleave between the read and the add.
      const cur = counters.get(day) ?? 0;
      if (cur + micro > cap) return { ok: false, totalMicro: cur };
      counters.set(day, cur + micro);
      return { ok: true, totalMicro: cur + micro };
    },
    async release(day, micro) {
      calls.push(`release:${micro}`);
      if (down) return null;
      const next = Math.max(0, (counters.get(day) ?? 0) - micro);
      counters.set(day, next);
      return next;
    },
    async read(day) { return down ? null : counters.get(day) ?? 0; },
  };
  return { store, counters, calls, setDown: (v: boolean) => { down = v; } };
}

let mem: ReturnType<typeof memoryStore>;
let ledgerUsd: number | null;
let ledgerCalls: number;
let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mem = memoryStore();
  ledgerUsd = 0;
  ledgerCalls = 0;
  setVeoCapDepsForTests({ store: mem.store, ledger: async () => { ledgerCalls++; return ledgerUsd; }, now: () => DAY });
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  setVeoCapDepsForTests();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('configuration — no figure lives in code', () => {
  it.each([[undefined], [''], ['  '], ['0'], ['-5'], ['abc'], ['NaN'], ['Infinity']])('VEO_DAILY_LIMIT_USD=%p → off', (v) => {
    expect(veoDailyLimitUsd({ VEO_DAILY_LIMIT_USD: v })).toBeNull();
    expect(veoCapEnforced({ VEO_DAILY_LIMIT_USD: v })).toBe(false);
  });
  it.each([['10', 10], [' 20 ', 20], ['2.5', 2.5]])('VEO_DAILY_LIMIT_USD=%p → %p', (v, n) => {
    expect(veoDailyLimitUsd({ VEO_DAILY_LIMIT_USD: v })).toBe(n);
  });
  it('off → allowed without touching Redis or the ledger', async () => {
    await expect(reserveVeoSpend(0.96, {})).resolves.toEqual({ ok: true, enforced: false });
    expect(mem.calls).toEqual([]);
    expect(ledgerCalls).toBe(0);
  });
  it('the day is the UTC day', () => {
    expect(veoDayKey(new Date('2026-10-15T23:59:59.999Z'))).toBe('2026-10-15');
    expect(veoDayKey(new Date('2026-10-16T00:00:00.000Z'))).toBe('2026-10-16');
  });
});

describe('reservations', () => {
  it('reserves under the figure and refuses the clip that would pass it, adding nothing', async () => {
    const env = ON('2');
    const a = await reserveVeoSpend(0.96, env);
    const b = await reserveVeoSpend(0.96, env);
    const c = await reserveVeoSpend(0.96, env);
    expect(a).toMatchObject({ ok: true, enforced: true, source: 'redis', spentUsd: 0.96, limitUsd: 2 });
    expect(b).toMatchObject({ ok: true, spentUsd: 1.92 });
    expect(c).toMatchObject({ ok: false, reason: 'veo_daily_limit', spentUsd: 1.92, limitUsd: 2 });
    expect(mem.counters.get('2026-10-15')).toBe(1_920_000);
    if (!c.ok) expect(veoCapRefusalDetail(c)).toMatch(/^veo_daily_limit: today's Veo ceiling of \$2 is reached/);
  });

  it('a clip exactly filling the figure passes; one micro-dollar more does not', async () => {
    const env = ON('1.92');
    expect((await reserveVeoSpend(1.92, env)).ok).toBe(true);
    expect((await reserveVeoSpend(0.000001, env)).ok).toBe(false);
  });

  it('racing films never pass the figure together', async () => {
    const env = ON('5');
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveVeoSpend(0.96, env)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(mem.counters.get('2026-10-15')).toBeLessThanOrEqual(5_000_000);
  });

  it('seeds the day ONCE from what the ledger already booked (a deployment that starts mid-day)', async () => {
    ledgerUsd = 9.5;
    const env = ON('10');
    const first = await reserveVeoSpend(0.4, env);
    expect(first).toMatchObject({ ok: true, spentUsd: 9.9 });
    expect(await reserveVeoSpend(0.4, env)).toMatchObject({ ok: false, reason: 'veo_daily_limit', spentUsd: 9.9 });
    expect(ledgerCalls).toBe(1);
  });

  it('two first requests of the day cannot both add the ledger figure', async () => {
    ledgerUsd = 3;
    const env = ON('10');
    await Promise.all([reserveVeoSpend(1, env), reserveVeoSpend(1, env)]);
    expect(mem.counters.get('2026-10-15')).toBe(5_000_000);
  });
});

describe('fail direction', () => {
  it('Redis down → the ledger decides (allowed under the figure, without a reservation)', async () => {
    mem.setDown(true);
    ledgerUsd = 1;
    const d = await reserveVeoSpend(0.96, ON('2'));
    expect(d).toMatchObject({ ok: true, enforced: true, source: 'ledger', micro: 0 });
  });
  it('Redis down → the ledger refuses over the figure', async () => {
    mem.setDown(true);
    ledgerUsd = 1.5;
    expect(await reserveVeoSpend(0.96, ON('2'))).toMatchObject({ ok: false, reason: 'veo_daily_limit', spentUsd: 1.5 });
  });
  it('Redis down AND ledger unreadable → refused (a ceiling nobody can count is not a ceiling)', async () => {
    mem.setDown(true);
    ledgerUsd = null;
    const d = await reserveVeoSpend(0.96, ON('50'));
    expect(d).toMatchObject({ ok: false, reason: 'veo_cap_unreadable', spentUsd: null });
    if (!d.ok) expect(veoCapRefusalDetail(d)).toMatch(/^veo_cap_unreadable:/);
  });
  it('a store that throws is a refusal, never an exception', async () => {
    setVeoCapDepsForTests({ store: { ...mem.store, exists: async () => { throw new Error('boom'); } } });
    await expect(reserveVeoSpend(0.96, ON('50'))).resolves.toMatchObject({ ok: false, reason: 'veo_cap_unreadable' });
  });
});

describe('release', () => {
  it('gives back exactly the reservation', async () => {
    const env = ON('2');
    const a = await reserveVeoSpend(0.96, env);
    await releaseVeoSpend(a);
    expect(mem.counters.get('2026-10-15')).toBe(0);
    expect((await reserveVeoSpend(1.92, env)).ok).toBe(true);
  });
  it('does nothing for a refusal, an off ceiling or a ledger-only allowance', async () => {
    const refused = await reserveVeoSpend(5, ON('2'));
    await releaseVeoSpend(refused);
    await releaseVeoSpend({ ok: true, enforced: false });
    mem.setDown(true);
    const ledgerOnly = await reserveVeoSpend(0.5, ON('2'));
    mem.setDown(false);
    await releaseVeoSpend(ledgerOnly);
    expect(mem.calls.filter((c) => c.startsWith('release'))).toEqual([]);
  });
});

describe('status read-out', () => {
  it('reports the figure, the day, the reserved and the booked spend', async () => {
    ledgerUsd = 0.4;
    await reserveVeoSpend(0.96, ON('10'));
    await expect(veoCapStatus(ON('10'))).resolves.toEqual({ enforced: true, limitUsd: 10, dayKey: '2026-10-15', reservedUsd: 1.36, ledgerUsd: 0.4 });
    await expect(veoCapStatus({})).resolves.toMatchObject({ enforced: false, limitUsd: null });
  });
});
