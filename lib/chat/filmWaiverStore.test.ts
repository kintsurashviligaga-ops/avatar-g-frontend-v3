/** @jest-environment node */
/**
 * The film's durable payment waiver (lib/chat/filmWaiverStore) and the predicate that reads it. The RPC contract itself is
 * proven on a real Postgres in filmWaiver.pg.test.ts; here the client is a stand-in, so this pins the CALLER's rules:
 * what each answer means, and that nothing that cannot be read ever waives a charge.
 */
jest.mock('server-only', () => ({}));
const netDebitedForRef = jest.fn();
const firstDebitAtForRef = jest.fn();
jest.mock('../orchestrator/ledger', () => ({
  netDebitedForRef: (...a: unknown[]) => netDebitedForRef(...a),
  firstDebitAtForRef: (...a: unknown[]) => firstDebitAtForRef(...a),
}));
const storeClaim = jest.fn();
const storeRelease = jest.fn();
jest.mock('../orchestrator/idempotencyStore', () => ({
  storeClaim: (...a: unknown[]) => storeClaim(...a),
  storeRelease: (...a: unknown[]) => storeRelease(...a),
}));

import { __setWaiverClientForTests, consumeFilmWaiver, filmChargeRefFor, recordFilmWaiver, restoreFilmWaiver } from './filmWaiverStore';
import { isFilmPaidUpstream, type FilmPaidRecord, type FilmStatusRecord } from './filmStatusStore';

const ENV = { ...process.env };
type Rpc = (fn: string, args: Record<string, unknown>) => { data: unknown; error: { code?: string; message?: string } | null };
function stubRpc(rpc: Rpc) {
  __setWaiverClientForTests(() => ({ rpc: async (fn, args) => rpc(fn, args) }));
}
const MISSING = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.consume_film_waiver' } };

beforeEach(() => {
  process.env = { ...ENV, SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_ROLE_KEY: 'x' };
  netDebitedForRef.mockReset();
  firstDebitAtForRef.mockReset().mockResolvedValue(Date.now() - 60_000); // charged a minute ago
  storeClaim.mockReset();
  storeRelease.mockReset();
});
afterAll(() => { process.env = ENV; __setWaiverClientForTests(null); });

describe('consumeFilmWaiver', () => {
  it('hands the database answer through', async () => {
    for (const a of ['paid', 'free', 'spent', 'void', 'none']) {
      stubRpc(() => ({ data: a, error: null }));
      expect(await consumeFilmWaiver('f1', 'u1')).toBe(a);
    }
  });

  it('an answer it does not know, or an error, is unavailable — never a waiver', async () => {
    stubRpc(() => ({ data: 'yes', error: null }));
    expect(await consumeFilmWaiver('f1', 'u1')).toBe('unavailable');
    stubRpc(() => ({ data: null, error: { code: '57014', message: 'timeout' } }));
    expect(await consumeFilmWaiver('f1', 'u1')).toBe('unavailable');
    expect(netDebitedForRef).not.toHaveBeenCalled();
  });

  it('with the table not applied: a ledger debit under the token ref + one claim = paid; a second call is spent', async () => {
    stubRpc(() => MISSING);
    netDebitedForRef.mockResolvedValue(240);
    storeClaim.mockResolvedValueOnce('claimed').mockResolvedValueOnce('held');
    expect(await consumeFilmWaiver('f0123456789abcdef', 'u1')).toBe('paid');
    expect(netDebitedForRef).toHaveBeenCalledWith('u1', filmChargeRefFor('f0123456789abcdef'));
    expect(await consumeFilmWaiver('f0123456789abcdef', 'u1')).toBe('spent');
  });

  it('with the table not applied: only a film token is vouched for (a music video\'s composite:…:charge debit waives nothing)', async () => {
    stubRpc(() => MISSING);
    netDebitedForRef.mockResolvedValue(240);
    storeClaim.mockResolvedValue('claimed');
    expect(await consumeFilmWaiver('composite:s1:1791960000000', 'u1')).toBe('none');
    expect(await consumeFilmWaiver('fABC', 'u1')).toBe('none');
    expect(netDebitedForRef).not.toHaveBeenCalled();
    expect(storeClaim).not.toHaveBeenCalled();
  });

  it('with the table not applied: a charge older than the claim window is not vouched for (an expired claim is taken over, not held)', async () => {
    stubRpc(() => MISSING);
    netDebitedForRef.mockResolvedValue(240);
    storeClaim.mockResolvedValue('claimed'); // what claim_request_idempotency answers once the first claim's row expired
    firstDebitAtForRef.mockResolvedValue(Date.now() - 61 * 60_000);
    expect(await consumeFilmWaiver('f0123456789abcdef', 'u1')).toBe('unavailable');
    firstDebitAtForRef.mockResolvedValue(Date.now() - 56 * 60_000); // inside the clock-skew margin: also not vouched for
    expect(await consumeFilmWaiver('f0123456789abcdef', 'u1')).toBe('unavailable');
    firstDebitAtForRef.mockResolvedValue(null); // unreadable
    expect(await consumeFilmWaiver('f0123456789abcdef', 'u1')).toBe('unavailable');
    expect(storeClaim).not.toHaveBeenCalled();
    firstDebitAtForRef.mockResolvedValue(Date.now() - 50 * 60_000);
    expect(await consumeFilmWaiver('f0123456789abcdef', 'u1')).toBe('paid');
    expect(storeClaim).toHaveBeenCalledWith('u1', 'film-waiver:f0123456789abcdef', 3600);
  });

  it('with the table not applied: no debit (or one refunded away) is none; an unreadable ledger or claim is unavailable', async () => {
    stubRpc(() => MISSING);
    netDebitedForRef.mockResolvedValue(0);
    expect(await consumeFilmWaiver('f0123456789abcdef', 'u1')).toBe('none');
    expect(storeClaim).not.toHaveBeenCalled();
    netDebitedForRef.mockResolvedValue(null);
    expect(await consumeFilmWaiver('f0123456789abcdef', 'u1')).toBe('unavailable');
    netDebitedForRef.mockResolvedValue(10);
    storeClaim.mockResolvedValue('unavailable');
    expect(await consumeFilmWaiver('f0123456789abcdef', 'u1')).toBe('unavailable');
  });

  it('is unavailable with no service-role configuration', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    stubRpc(() => ({ data: 'paid', error: null }));
    expect(await consumeFilmWaiver('f1', 'u1')).toBe('unavailable');
  });
});

describe('record / restore', () => {
  it('record sends the paid shape (credits + ledger ref) and the free shape (no credits, no ref)', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    stubRpc((fn, args) => { calls.push([fn, args]); return { data: true, error: null }; });
    expect(await recordFilmWaiver('f1', 'u1', { kind: 'paid', credits: 240, ref: filmChargeRefFor('f1') })).toBe(true);
    expect(await recordFilmWaiver('f2', 'u1', { kind: 'free' })).toBe(true);
    expect(calls[0][1]).toEqual({ p_token: 'f1', p_user: 'u1', p_kind: 'paid', p_credits: 240, p_ref: 'f1:charge' });
    expect(calls[1][1]).toEqual({ p_token: 'f2', p_user: 'u1', p_kind: 'free', p_credits: 0, p_ref: null });
  });

  it('record reports false (never throws) when the database refuses', async () => {
    stubRpc(() => ({ data: null, error: { code: '22023', message: 'no_ledger_debit' } }));
    expect(await recordFilmWaiver('f1', 'u1', { kind: 'paid', credits: 5, ref: 'f1:charge' })).toBe(false);
  });

  it('restore gives the table waiver back, or frees the fallback claim when there is no table', async () => {
    const seen: string[] = [];
    stubRpc((fn) => { seen.push(fn); return { data: true, error: null }; });
    await restoreFilmWaiver('f1', 'u1');
    expect(seen).toEqual(['restore_film_waiver']);
    expect(storeRelease).not.toHaveBeenCalled();
    stubRpc(() => MISSING);
    await restoreFilmWaiver('f1', 'u1');
    expect(storeRelease).toHaveBeenCalledWith('u1', 'film-waiver:f1');
  });
});

describe('isFilmPaidUpstream with the durable answer', () => {
  const status = (over: Partial<FilmStatusRecord> = {}): FilmStatusRecord => ({
    tokenId: 'f1', phase: 'rendering', clips: [], audioReady: false, masterUrl: null, updatedAt: 1, error: null, ...over,
  });
  const paidRec = (over: Partial<FilmPaidRecord> = {}): FilmPaidRecord => ({ tokenId: 'f1', uid: 'u1', credits: 240, ref: 'f1:charge', consumed: false, at: 1, ...over });

  it('paid / free from the database waive with Redis empty (the Production case)', () => {
    expect(isFilmPaidUpstream(null, null, 'u1', 'paid')).toBe(true);
    expect(isFilmPaidUpstream(null, null, 'u1', 'free')).toBe(true);
  });

  it('an anonymous caller is never waived', () => {
    expect(isFilmPaidUpstream(null, null, null, 'paid')).toBe(false);
  });

  it('spent / void: an unspent Redis marker must not waive a second time', () => {
    expect(isFilmPaidUpstream(null, paidRec(), 'u1', 'spent')).toBe(false);
    expect(isFilmPaidUpstream(status({ freeFilmWaived: true, payerUid: 'u1' }), null, 'u1', 'spent')).toBe(false);
    expect(isFilmPaidUpstream(null, paidRec(), 'u1', 'void')).toBe(false);
  });

  it('spent: the master the first stitch stamped still covers its own re-stitch, owner-bound', () => {
    const s = status({ masterUrl: 'https://x/m.mp4', payerUid: 'u1' });
    expect(isFilmPaidUpstream(s, null, 'u1', 'spent')).toBe(true);
    expect(isFilmPaidUpstream(s, null, 'u2', 'spent')).toBe(false);
  });

  it('none / unavailable keep the Redis behaviour exactly as before', () => {
    for (const d of ['none', 'unavailable'] as const) {
      expect(isFilmPaidUpstream(null, paidRec(), 'u1', d)).toBe(true);
      expect(isFilmPaidUpstream(null, paidRec({ consumed: true }), 'u1', d)).toBe(false);
      expect(isFilmPaidUpstream(null, paidRec({ uid: 'u2' }), 'u1', d)).toBe(false);
      expect(isFilmPaidUpstream(status({ freeFilmWaived: true, payerUid: 'u1' }), null, 'u1', d)).toBe(true);
      expect(isFilmPaidUpstream(null, null, 'u1', d)).toBe(false);
    }
    expect(isFilmPaidUpstream(null, paidRec(), 'u1')).toBe(true);
  });
});
