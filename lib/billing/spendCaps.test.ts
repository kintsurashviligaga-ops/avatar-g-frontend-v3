/** @jest-environment node */
/**
 * Phase 8.21 hard caps: a burst of 1,000 paid starts must stop at the figure, whatever the service, and every cap is
 * off (nothing touched) until its env figure is set.
 */
jest.mock('server-only', () => ({}));

const canProceed = jest.fn();
const recordUsage = jest.fn();
jest.mock('../services/billing/BillingGuard', () => ({
  canProceed: (...a: unknown[]) => canProceed(...a),
  recordUsage: (...a: unknown[]) => recordUsage(...a),
}));

// eslint-disable-next-line import/first
import {
  claimUserStart,
  memoryCapStore,
  reserveGlobalSpend,
  setSpendCapDepsForTests,
  type CapStore,
} from './spendCaps';
// eslint-disable-next-line import/first
import { guardedCall, BudgetExceededError } from '../services/billing/guardedCall';
// eslint-disable-next-line import/first
import { setSpendAlertChannelsForTests } from './spendAlert';
// eslint-disable-next-line import/first
import { budgetRefusalMessage } from '../services/billing/budgetMessage';

const down: CapStore = {
  seedIfAbsent: async () => null,
  addCapped: async () => null,
  adjust: async () => null,
  lease: async () => null,
  unlease: async () => null,
};

const ENV_KEYS = ['GLOBAL_DAILY_LIMIT_USD', 'USER_MAX_CONCURRENT_JOBS', 'USER_DAILY_PAID_STARTS', 'SPEND_ALERT_USD'] as const;
const saved: Record<string, string | undefined> = {};
let now = new Date('2026-11-27T12:00:00Z');

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  now = new Date('2026-11-27T12:00:00Z');
  setSpendCapDepsForTests({ store: memoryCapStore(), fallback: memoryCapStore(), ledger: async () => 0, now: () => now });
  canProceed.mockReset().mockResolvedValue({ allowed: true, reason: 'ok', mode: 'normal', projectedDaily: 0, projectedMonthly: 0, degraded: false });
  recordUsage.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  setSpendCapDepsForTests();
  setSpendAlertChannelsForTests(null);
});

const video = (userId = 'u1') => guardedCall({ service: 'video', model: 'veo-3.1-fast', units: 8, userId }, async () => 'op');

describe('flags off', () => {
  it('touches no store and changes nothing', async () => {
    const spy: CapStore = {
      seedIfAbsent: jest.fn(), addCapped: jest.fn(), adjust: jest.fn(), lease: jest.fn(), unlease: jest.fn(),
    } as unknown as CapStore;
    setSpendCapDepsForTests({ store: spy, fallback: spy, ledger: jest.fn() });
    for (let i = 0; i < 20; i++) await expect(video()).resolves.toBe('op');
    for (const fn of Object.values(spy)) expect(fn).not.toHaveBeenCalled();
  });
});

describe('global daily cap (GLOBAL_DAILY_LIMIT_USD)', () => {
  it('stops a 1,000-call burst at the figure, even though none of them is booked yet', async () => {
    process.env.GLOBAL_DAILY_LIMIT_USD = '50';
    const results = await Promise.allSettled(Array.from({ length: 1000 }, (_, i) => video(`user-${i}`)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const refused = results.filter((r) => r.status === 'rejected' && (r.reason as BudgetExceededError).reason === 'global_daily_cap').length;
    expect(ok).toBeGreaterThan(0);
    expect(ok + refused).toBe(1000);
    // The estimate of one clip times the calls that ran never passes $50.
    const est = (canProceed.mock.calls[0]![0] as { estimatedCost: number }).estimatedCost;
    expect(ok * est).toBeLessThanOrEqual(50 + 1e-6);
  });

  it('gives a failed call its reservation back', async () => {
    process.env.GLOBAL_DAILY_LIMIT_USD = '1';
    for (let i = 0; i < 50; i++) {
      await expect(guardedCall({ service: 'image', model: 'gemini-3.1-flash-image', units: 1 }, async () => { throw new Error('503'); })).rejects.toThrow('503');
    }
    await expect(guardedCall({ service: 'image', model: 'gemini-3.1-flash-image', units: 1 }, async () => 'img')).resolves.toBe('img');
  });

  it('counts what the ledger booked before this deployment started', async () => {
    process.env.GLOBAL_DAILY_LIMIT_USD = '10';
    setSpendCapDepsForTests({ store: memoryCapStore(), ledger: async () => 9.99, now: () => now });
    const r = await reserveGlobalSpend(0.5);
    expect(r).toMatchObject({ ok: false, reason: 'global_daily_cap' });
  });

  it('falls back to the ledger without Redis, and REFUSES when neither can be read', async () => {
    process.env.GLOBAL_DAILY_LIMIT_USD = '10';
    setSpendCapDepsForTests({ store: down, ledger: async () => 2, now: () => now });
    expect(await reserveGlobalSpend(1)).toMatchObject({ ok: true, source: 'ledger' });
    setSpendCapDepsForTests({ store: down, ledger: async () => null, now: () => now });
    expect(await reserveGlobalSpend(1)).toMatchObject({ ok: false, reason: 'global_cap_unreadable' });
  });

  it('a new UTC day starts at zero', async () => {
    process.env.GLOBAL_DAILY_LIMIT_USD = '1';
    expect(await reserveGlobalSpend(1)).toMatchObject({ ok: true });
    expect(await reserveGlobalSpend(0.01)).toMatchObject({ ok: false });
    now = new Date('2026-11-28T00:00:01Z');
    expect(await reserveGlobalSpend(1)).toMatchObject({ ok: true });
  });

  it('tells the owner when the cap refuses, once', async () => {
    process.env.GLOBAL_DAILY_LIMIT_USD = '0.000001';
    process.env.SPEND_ALERT_USD = '50';
    const sent: string[] = [];
    const seen = new Set<string>();
    setSpendAlertChannelsForTests({
      telegram: async (t) => { sent.push(t); return true; },
      email: async () => true,
      once: async (k) => (seen.has(k) ? false : (seen.add(k), true)),
    });
    for (let i = 0; i < 5; i++) await expect(video()).rejects.toBeInstanceOf(BudgetExceededError);
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('global_daily_cap');
  });
});

describe('per-user concurrency (USER_MAX_CONCURRENT_JOBS)', () => {
  it('caps one account across ALL services, not per service', async () => {
    process.env.USER_MAX_CONCURRENT_JOBS = '2';
    await expect(video()).resolves.toBe('op');
    await expect(guardedCall({ service: 'avatar', model: 'veo-3.1-fast', units: 8, userId: 'u1' }, async () => 'a')).resolves.toBe('a');
    await expect(guardedCall({ service: 'model3d', model: 'trellis', units: 1, userId: 'u1' }, async () => 'm')).rejects.toMatchObject({ reason: 'user_concurrency' });
    // Another account is not affected.
    await expect(video('u2')).resolves.toBe('op');
  });

  it('a long job holds its slot until its lease expires; a quick call gives it back at once', async () => {
    process.env.USER_MAX_CONCURRENT_JOBS = '1';
    for (let i = 0; i < 5; i++) await expect(guardedCall({ service: 'image', model: 'gemini-3.1-flash-image', units: 1, userId: 'u1' }, async () => 'img')).resolves.toBe('img');
    await expect(video()).resolves.toBe('op');
    await expect(video()).rejects.toMatchObject({ reason: 'user_concurrency' });
    now = new Date(now.getTime() + 16 * 60_000);
    await expect(video()).resolves.toBe('op');
  });

  it('a failed start gives its slot back', async () => {
    process.env.USER_MAX_CONCURRENT_JOBS = '1';
    await expect(guardedCall({ service: 'video', model: 'veo-3.1-fast', units: 8, userId: 'u1' }, async () => { throw new Error('quota'); })).rejects.toThrow('quota');
    await expect(video()).resolves.toBe('op');
  });

  it('without Redis it still counts, in this instance', async () => {
    process.env.USER_MAX_CONCURRENT_JOBS = '1';
    setSpendCapDepsForTests({ store: down, fallback: memoryCapStore(), now: () => now });
    expect((await claimUserStart('u1', 'video')).ok).toBe(true);
    expect(await claimUserStart('u1', 'video')).toMatchObject({ ok: false, reason: 'user_concurrency' });
  });
});

describe('per-user daily starts (USER_DAILY_PAID_STARTS)', () => {
  it('stops one account after the figure, and resets the next UTC day', async () => {
    process.env.USER_DAILY_PAID_STARTS = '3';
    for (let i = 0; i < 3; i++) await expect(video()).resolves.toBe('op');
    await expect(video()).rejects.toMatchObject({ reason: 'user_daily_cap' });
    now = new Date('2026-11-28T00:00:01Z');
    await expect(video()).resolves.toBe('op');
  });

  it('a refused concurrency claim does not use up a daily start', async () => {
    process.env.USER_DAILY_PAID_STARTS = '2';
    process.env.USER_MAX_CONCURRENT_JOBS = '1';
    await expect(video()).resolves.toBe('op');
    for (let i = 0; i < 5; i++) await expect(video()).rejects.toMatchObject({ reason: 'user_concurrency' });
    now = new Date(now.getTime() + 16 * 60_000);
    await expect(video()).resolves.toBe('op');
    now = new Date(now.getTime() + 16 * 60_000);
    await expect(video()).rejects.toMatchObject({ reason: 'user_daily_cap' });
  });
});

describe('what the person reads', () => {
  it('says the owner’s Georgian line for a daily cap, in every language', () => {
    expect(budgetRefusalMessage('ka', 'global_daily_cap')).toContain('დღიური ლიმიტი ამოიწურა, სცადეთ ხვალ');
    expect(budgetRefusalMessage('ka', 'user_daily_cap')).toContain('დღიური ლიმიტი ამოიწურა, სცადეთ ხვალ');
    expect(budgetRefusalMessage('en', 'global_daily_cap')).toMatch(/try again tomorrow/);
    expect(budgetRefusalMessage('ru', 'user_daily_cap')).toMatch(/завтра/);
    expect(budgetRefusalMessage('ka', 'user_concurrency')).toMatch(/ერთდროულად/);
    expect(budgetRefusalMessage('ka', 'global_cap_unreadable')).toBe(budgetRefusalMessage('ka', 'guard_unavailable'));
  });
});
