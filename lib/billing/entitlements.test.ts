/** @jest-environment node */
/**
 * The paid check decides whether an output carries the MyAvatar mark, so every branch here is revenue.
 *
 * The cases that matter, and why each one is a real mistake someone would make:
 *   · a brand-new account has 50 free credits → a balance check would exempt exactly the wrong people
 *   · `profiles.tier` is written by NO application code → it cannot be the only signal
 *   · a database error must mean "free", never "paid"
 */
const from = jest.fn();
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => ({ from }) }));

// eslint-disable-next-line import/first
import { hasPaidPlan, shouldWatermark } from './entitlements';

/** One PostgREST chain: .select().eq().limit().maybeSingle() and .select().eq().maybeSingle(). */
function chain(result: { data?: unknown; error?: unknown }) {
  const self: Record<string, unknown> = {};
  self.select = () => self;
  self.eq = () => self;
  self.limit = () => self;
  self.maybeSingle = async () => ({ data: result.data ?? null, error: result.error ?? null });
  return self;
}

/** Route each table to its own canned answer. */
function db(tables: { wallet_topups?: { data?: unknown; error?: unknown }; profiles?: { data?: unknown; error?: unknown } }) {
  from.mockImplementation((t: string) => chain((tables as Record<string, { data?: unknown; error?: unknown }>)[t] ?? {}));
}

beforeEach(() => jest.clearAllMocks());

describe('hasPaidPlan', () => {
  it('is true once a verified payment has landed', async () => {
    db({ wallet_topups: { data: { ref: 'bog:abc' } } });
    await expect(hasPaidPlan('u1')).resolves.toBe(true);
  });

  it('is true for a hand-comped tier', async () => {
    db({ wallet_topups: {}, profiles: { data: { tier: 'PRO' } } });
    await expect(hasPaidPlan('u1')).resolves.toBe(true);
  });

  it('is FALSE for a fresh free account', async () => {
    // The one that pays for this file: a new signup holds 50 trial credits and tier 'FREE'.
    db({ wallet_topups: {}, profiles: { data: { tier: 'FREE' } } });
    await expect(hasPaidPlan('u1')).resolves.toBe(false);
  });

  it('is FALSE when the profile row is missing entirely', async () => {
    db({ wallet_topups: {}, profiles: { data: null } });
    await expect(hasPaidPlan('u1')).resolves.toBe(false);
  });

  it('FAILS CLOSED when the database errors', async () => {
    // Not "assume they paid". An outage must not hand unmarked video to every free account.
    db({ wallet_topups: { error: { message: 'connection reset' } } });
    await expect(hasPaidPlan('u1')).resolves.toBe(false);
  });

  it('FAILS CLOSED when the profile lookup errors', async () => {
    db({ wallet_topups: {}, profiles: { error: { message: 'timeout' } } });
    await expect(hasPaidPlan('u1')).resolves.toBe(false);
  });

  it('never queries at all without a user id', async () => {
    await expect(hasPaidPlan('')).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('shouldWatermark', () => {
  it('marks a free account', async () => {
    db({ wallet_topups: {}, profiles: { data: { tier: 'FREE' } } });
    await expect(shouldWatermark('u1')).resolves.toBe(true);
  });

  it('leaves a paying account clean', async () => {
    db({ wallet_topups: { data: { ref: 'stripe:cs_1' } } });
    await expect(shouldWatermark('u1')).resolves.toBe(false);
  });
});
