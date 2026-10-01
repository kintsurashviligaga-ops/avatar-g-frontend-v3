/** @jest-environment node */
import { resolveUserTier, resolveUserTierDetailed, type TierReader } from './resolveTier';

type Result = { data: unknown; error: unknown };

/**
 * A fake Supabase client that answers only the two reads the resolver makes:
 *   subscriptions: select(...).eq('user_id', id).limit(n)            → awaited directly
 *   profiles:      select('tier').eq('id', id).maybeSingle()
 * Each table can be given a result, a thrown error, or left absent (→ the PostgREST "table not found" error).
 */
function fakeDb(tables: { subscriptions?: Result | Error; profiles?: Result | Error }) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const answer = (table: 'subscriptions' | 'profiles'): Promise<Result> => {
    const r = tables[table];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } });
  };
  const db = {
    from(table: string) {
      const call = { table, filters: [] as Array<[string, unknown]> };
      calls.push(call);
      const chain = {
        select: () => chain,
        eq: (col: string, v: unknown) => {
          call.filters.push([col, v]);
          return chain;
        },
        limit: () => answer(table as 'subscriptions'),
        maybeSingle: () => answer(table as 'profiles'),
      };
      return chain;
    },
  };
  return { db: db as unknown as TierReader, calls };
}

const NOW = Date.parse('2026-10-01T12:00:00Z');
const FUTURE = '2026-10-20T00:00:00Z';
const PAST = '2026-09-30T00:00:00Z';
const ENV = { STRIPE_PRICE_STARTER: 'price_s', STRIPE_PRICE_CREATOR: 'price_c', STRIPE_PRICE_BUSINESS: 'price_b' };
const opts = { env: ENV, now: NOW };

const sub = (over: Record<string, unknown>) => ({
  tier: null,
  stripe_price_id: 'price_c',
  status: 'active',
  current_period_end: FUTURE,
  stripe_subscription_id: 'sub_1',
  ...over,
});

describe('resolveUserTier — subscription first', () => {
  it('an active subscription in its period resolves by price id', async () => {
    const { db, calls } = fakeDb({ subscriptions: { data: [sub({})], error: null } });
    const r = await resolveUserTierDetailed(db, 'u1', opts);
    expect(r).toEqual({ tier: 'creator', source: 'subscription', stripeSubscriptionId: 'sub_1', currentPeriodEnd: '2026-10-20T00:00:00.000Z' });
    expect(calls[0]).toEqual({ table: 'subscriptions', filters: [['user_id', 'u1']] });
    // A subscription answered — the comp column is not consulted.
    expect(calls.map((c) => c.table)).toEqual(['subscriptions']);
  });

  it('trialing counts too', async () => {
    const { db } = fakeDb({ subscriptions: { data: [sub({ status: 'trialing', stripe_price_id: 'price_s' })], error: null } });
    expect(await resolveUserTier(db, 'u1', opts)).toBe('starter');
  });

  it('the price id wins over the stored tier; the stored tier is used only when the price no longer maps', async () => {
    const a = fakeDb({ subscriptions: { data: [sub({ tier: 'business', stripe_price_id: 'price_s' })], error: null } });
    expect(await resolveUserTier(a.db, 'u1', opts)).toBe('starter');
    const b = fakeDb({ subscriptions: { data: [sub({ tier: 'business', stripe_price_id: 'price_rotated_away' })], error: null } });
    expect(await resolveUserTier(b.db, 'u1', opts)).toBe('business');
  });

  it('with no price env configured, a stored tier still resolves (rows written by the allowance grant)', async () => {
    const { db } = fakeDb({ subscriptions: { data: [sub({ tier: 'creator' })], error: null } });
    expect(await resolveUserTier(db, 'u1', { env: {}, now: NOW })).toBe('creator');
  });

  it('picks the highest of several entitling subscriptions', async () => {
    const { db } = fakeDb({
      subscriptions: {
        data: [sub({ stripe_price_id: 'price_s', stripe_subscription_id: 'a' }), sub({ stripe_price_id: 'price_b', stripe_subscription_id: 'b' }), sub({ stripe_price_id: 'price_c', stripe_subscription_id: 'c' })],
        error: null,
      },
    });
    const r = await resolveUserTierDetailed(db, 'u1', opts);
    expect(r.tier).toBe('business');
    expect(r.stripeSubscriptionId).toBe('b');
  });

  it.each([
    ['an expired period', { current_period_end: PAST }],
    ['a period ending exactly now', { current_period_end: new Date(NOW).toISOString() }],
    ['an unparseable period end', { current_period_end: 'soon' }],
    ['a missing period end', { current_period_end: null }],
    ['past_due', { status: 'past_due' }],
    ['canceled', { status: 'canceled' }],
    ['incomplete', { status: 'incomplete' }],
    ['an unmapped price and no stored tier', { stripe_price_id: 'price_unknown' }],
    ['a stored tier of "free"', { stripe_price_id: 'price_unknown', tier: 'free' }],
    ['a stored tier outside the catalogue', { stripe_price_id: null, tier: 'enterprise' }],
  ])('%s does not entitle', async (_label, over) => {
    const { db } = fakeDb({ subscriptions: { data: [sub(over)], error: null }, profiles: { data: { tier: 'FREE' }, error: null } });
    expect(await resolveUserTierDetailed(db, 'u1', opts)).toEqual({ tier: 'free', source: 'default' });
  });
});

describe('resolveUserTier — comp, then free', () => {
  it('falls back to a comped profiles.tier when there is no subscription', async () => {
    const { db, calls } = fakeDb({ subscriptions: { data: [], error: null }, profiles: { data: { tier: 'PRO' }, error: null } });
    expect(await resolveUserTierDetailed(db, 'u1', opts)).toEqual({ tier: 'creator', source: 'comp' });
    expect(calls[1]).toEqual({ table: 'profiles', filters: [['id', 'u1']] });
  });

  it('accepts the new tier names in the comp column', async () => {
    const { db } = fakeDb({ subscriptions: { data: [], error: null }, profiles: { data: { tier: 'BUSINESS' }, error: null } });
    expect(await resolveUserTier(db, 'u1', opts)).toBe('business');
  });

  it('FREE, a missing row and junk all resolve to free', async () => {
    for (const data of [{ tier: 'FREE' }, null, { tier: 'GOD_MODE' }, { tier: 7 }]) {
      const { db } = fakeDb({ subscriptions: { data: [], error: null }, profiles: { data, error: null } });
      expect(await resolveUserTierDetailed(db, 'u1', opts)).toEqual({ tier: 'free', source: 'default' });
    }
  });
});

describe('resolveUserTier — fail-safe, never throws', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => { warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => warnSpy.mockRestore());

  it('a missing subscriptions table (today’s live state) still lets a comp through', async () => {
    const { db } = fakeDb({ profiles: { data: { tier: 'PRO' }, error: null } });
    expect(await resolveUserTier(db, 'u1', opts)).toBe('creator');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('both reads erroring → free', async () => {
    const { db } = fakeDb({ subscriptions: { data: null, error: { message: 'boom' } }, profiles: { data: null, error: { message: 'boom' } } });
    expect(await resolveUserTierDetailed(db, 'u1', opts)).toEqual({ tier: 'free', source: 'default' });
  });

  it('both reads THROWING → free', async () => {
    const { db } = fakeDb({ subscriptions: new Error('network down'), profiles: new Error('network down') });
    await expect(resolveUserTier(db, 'u1', opts)).resolves.toBe('free');
  });

  it('a client whose from() itself throws → free', async () => {
    const db = { from: () => { throw new Error('not configured'); } } as unknown as TierReader;
    await expect(resolveUserTier(db, 'u1', opts)).resolves.toBe('free');
  });

  it('a non-array subscriptions payload is ignored', async () => {
    const { db } = fakeDb({ subscriptions: { data: { tier: 'business' }, error: null }, profiles: { data: null, error: null } });
    expect(await resolveUserTier(db, 'u1', opts)).toBe('free');
  });

  it('no client or no user id → free without touching anything', async () => {
    const { db, calls } = fakeDb({});
    expect(await resolveUserTier(null, 'u1', opts)).toBe('free');
    expect(await resolveUserTier(db, '', opts)).toBe('free');
    expect(await resolveUserTier(db, '   ', opts)).toBe('free');
    expect(await resolveUserTier(db, undefined, opts)).toBe('free');
    expect(calls).toHaveLength(0);
  });

  it('returns a fresh object each time (the default is not shared mutable state)', async () => {
    const a = await resolveUserTierDetailed(null, 'u1');
    a.tier = 'business';
    expect((await resolveUserTierDetailed(null, 'u1')).tier).toBe('free');
  });
});
