/** @jest-environment node */
/**
 * Defect 44 / Priority 1 — the film's payment waiver through the REAL supabase-js client against a throwaway Postgres 16 +
 * PostgREST (scripts/lease-isolation/run.sh), in the two states Production can be in:
 *   WAIVER_PHASE=before — docs/handoffs/video-core/proposals/20261014a_film_payment_waivers.sql NOT applied (Production today):
 *                         the ledger's own debit proves a paid film and request_idempotency makes the spend single-use;
 *   WAIVER_PHASE=after  — the proposal applied: one UPDATE hands the waiver to exactly one of N concurrent assembles, a paid
 *                         waiver needs a ledger debit, a refunded film has none, and only service_role can touch any of it.
 * Redis is absent throughout (no UPSTASH / KV env), which is the Production situation this closes.
 *
 * Opt-in: runs only with LEASE_PG_REST_URL, LEASE_PG_JWT_SECRET and WAIVER_PHASE, and never against a URL that is not local.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

const REST = process.env.LEASE_PG_REST_URL ?? '';
const SECRET = process.env.LEASE_PG_JWT_SECRET ?? '';
const PHASE = process.env.WAIVER_PHASE ?? '';
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(REST);
const suite = REST && SECRET && local && (PHASE === 'before' || PHASE === 'after') ? describe : describe.skip;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function clientAs(claims: Record<string, unknown>): PostgrestClient {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const body = b64({ ...claims, iat: now, exp: now + 3600 });
  const jwt = REST && SECRET ? `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}` : '';
  return new PostgrestClient(REST || 'http://127.0.0.1:1', { headers: { apikey: jwt, Authorization: `Bearer ${jwt}` } });
}
const db = clientAs({ role: 'service_role' });

jest.mock('server-only', () => ({}));
jest.mock('../observability/report-error', () => ({ reportError: () => undefined }));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => db, createSupabaseServerClient: () => db }));

import { deductCredits, refundCredits } from '../orchestrator/ledger';
import { __setStoreClientForTests } from '../orchestrator/idempotencyStore';
import { consumeFilmWaiver, filmChargeRefFor, recordFilmWaiver, restoreFilmWaiver, __setWaiverClientForTests } from './filmWaiverStore';
import { isFilmPaidUpstream } from './filmStatusStore';

const ENV = { ...process.env };
beforeEach(() => {
  process.env = { ...ENV, SUPABASE_URL: REST, SUPABASE_SERVICE_ROLE_KEY: 'local-only' };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.KV_REST_API_URL;
  __setStoreClientForTests(() => db);
  __setWaiverClientForTests(() => db);
});
afterAll(() => { process.env = ENV; __setStoreClientForTests(null); __setWaiverClientForTests(null); });

async function newUser(credits: number): Promise<string> {
  const id = randomUUID();
  const { error } = await db.from('profiles').insert({ id, email: `waiver-${id}@local.test`, credits_balance: credits });
  if (error) throw new Error(error.message);
  return id;
}
async function balance(id: string): Promise<number> {
  const { data } = await db.from('profiles').select('credits_balance').eq('id', id).single();
  return (data as { credits_balance: number }).credits_balance;
}
const tokenId = () => `f${randomUUID().replace(/-/g, '').slice(0, 16)}`;

/** A film as the chat route starts it: the debit under the token's own ref, then the waiver. */
async function paidFilm(credits = 240) {
  const user = await newUser(1000);
  const token = tokenId();
  const ref = filmChargeRefFor(token);
  expect((await deductCredits(user, credits, ref)).ok).toBe(true);
  return { user, token, ref, credits };
}

suite(`the film payment waiver on a real PostgREST (${PHASE} 20261014a)`, () => {
  if (PHASE === 'before') {
    it('the table is not there (Production today)', async () => {
      const { error } = await db.rpc('consume_film_waiver', { p_token: 'x', p_user: randomUUID() });
      expect(error?.message ?? '').toMatch(/Could not find the function/);
    });

    it('a paid film is proven by the ledger alone: Redis absent, the first assemble is waived, a replay and a twin are not', async () => {
      const f = await paidFilm();
      expect(await recordFilmWaiver(f.token, f.user, { kind: 'paid', credits: f.credits, ref: f.ref })).toBe(false); // no table: a no-op, never a throw
      const answers = await Promise.all(Array.from({ length: 24 }, () => consumeFilmWaiver(f.token, f.user)));
      expect(answers.filter((a) => a === 'paid')).toHaveLength(1);
      expect(answers.filter((a) => a === 'spent')).toHaveLength(23);
      expect(isFilmPaidUpstream(null, null, f.user, 'paid')).toBe(true);
      expect(isFilmPaidUpstream(null, null, f.user, 'spent')).toBe(false);
      expect(await balance(f.user)).toBe(1000 - f.credits); // nothing was charged a second time
    });

    it('a stitch that failed hands the waiver back; the retry is waived once more, then spent', async () => {
      const f = await paidFilm();
      expect(await consumeFilmWaiver(f.token, f.user)).toBe('paid');
      await restoreFilmWaiver(f.token, f.user);
      expect(await consumeFilmWaiver(f.token, f.user)).toBe('paid');
      expect(await consumeFilmWaiver(f.token, f.user)).toBe('spent');
    });

    it('a charge older than the 1 h claim window is not vouched for by the ledger (an expired claim would be taken over)', async () => {
      const f = await paidFilm();
      const old = new Date(Date.now() - 2 * 3600_000).toISOString();
      const { error } = await db.from('credit_ledger').update({ created_at: old }).eq('user_id', f.user).lt('delta', 0);
      expect(error).toBeNull();
      expect(await consumeFilmWaiver(f.token, f.user)).toBe('unavailable');
      expect(await consumeFilmWaiver(f.token, f.user)).toBe('unavailable'); // never 'paid', however often it is asked
    });

    it('another user, an unpaid token and a fully refunded film are never waived', async () => {
      const f = await paidFilm();
      const other = await newUser(1000);
      expect(await consumeFilmWaiver(f.token, other)).toBe('none');
      expect(await consumeFilmWaiver(tokenId(), f.user)).toBe('none');
      expect((await refundCredits(f.user, f.credits, `${f.ref}:refund`)).ok).toBe(true);
      expect(await consumeFilmWaiver(f.token, f.user)).toBe('none');
    });
    return;
  }

  it('the table and its functions are provisioned', async () => {
    const { error } = await db.rpc('consume_film_waiver', { p_token: 'probe', p_user: randomUUID() });
    expect(error).toBeNull();
  });

  it('a paid waiver needs a ledger debit of THAT user under THAT ref: no debit, no row', async () => {
    const user = await newUser(1000);
    const token = tokenId();
    expect(await recordFilmWaiver(token, user, { kind: 'paid', credits: 240, ref: filmChargeRefFor(token) })).toBe(false);
    const f = await paidFilm();
    const thief = await newUser(1000);
    expect(await recordFilmWaiver(f.token, thief, { kind: 'paid', credits: f.credits, ref: f.ref })).toBe(false); // someone else's debit
    expect(await recordFilmWaiver(f.token, f.user, { kind: 'paid', credits: f.credits, ref: f.ref })).toBe(true);
  });

  it('twenty-four concurrent assembles of one paid film: exactly one is waived, the rest are spent, nothing is charged twice', async () => {
    const f = await paidFilm();
    expect(await recordFilmWaiver(f.token, f.user, { kind: 'paid', credits: f.credits, ref: f.ref })).toBe(true);
    const answers = await Promise.all(Array.from({ length: 24 }, () => consumeFilmWaiver(f.token, f.user)));
    expect(answers.filter((a) => a === 'paid')).toHaveLength(1);
    expect(answers.filter((a) => a === 'spent')).toHaveLength(23);
    expect(await balance(f.user)).toBe(1000 - f.credits);
  });

  it('recording twice keeps the first (a replay of the start changes nothing)', async () => {
    const f = await paidFilm();
    expect(await recordFilmWaiver(f.token, f.user, { kind: 'paid', credits: f.credits, ref: f.ref })).toBe(true);
    const again = await db.rpc('record_film_waiver', { p_token: f.token, p_user: f.user, p_kind: 'paid', p_credits: f.credits, p_ref: f.ref });
    expect(again.data).toBe(false);
    expect(await consumeFilmWaiver(f.token, f.user)).toBe('paid');
  });

  it('a stitch that failed hands the waiver back, once; the retry is waived; a restore with nothing spent does nothing', async () => {
    const f = await paidFilm();
    await recordFilmWaiver(f.token, f.user, { kind: 'paid', credits: f.credits, ref: f.ref });
    const nothingSpent = await db.rpc('restore_film_waiver', { p_token: f.token, p_user: f.user });
    expect(nothingSpent.data).toBe(false);
    expect(await consumeFilmWaiver(f.token, f.user)).toBe('paid');
    await restoreFilmWaiver(f.token, f.user);
    expect(await consumeFilmWaiver(f.token, f.user)).toBe('paid');
    expect(await consumeFilmWaiver(f.token, f.user)).toBe('spent');
  });

  it('owner-bound: another user and an unknown token get none', async () => {
    const f = await paidFilm();
    await recordFilmWaiver(f.token, f.user, { kind: 'paid', credits: f.credits, ref: f.ref });
    expect(await consumeFilmWaiver(f.token, await newUser(10))).toBe('none');
    expect(await consumeFilmWaiver(tokenId(), f.user)).toBe('none');
    const other = await newUser(10);
    await restoreFilmWaiver(f.token, other); // another user cannot hand back (or spend) the owner's waiver
    expect(await consumeFilmWaiver(f.token, f.user)).toBe('paid');
  });

  it('a film refunded in full has no waiver left (void); a partial dispatch refund keeps it', async () => {
    const whole = await paidFilm();
    await recordFilmWaiver(whole.token, whole.user, { kind: 'paid', credits: whole.credits, ref: whole.ref });
    expect((await refundCredits(whole.user, whole.credits, `${whole.ref}:refund`)).ok).toBe(true);
    expect(await consumeFilmWaiver(whole.token, whole.user)).toBe('void');

    const part = await paidFilm();
    await recordFilmWaiver(part.token, part.user, { kind: 'paid', credits: part.credits, ref: part.ref });
    expect((await refundCredits(part.user, 40, `${part.ref}:refund:dispatch`)).ok).toBe(true);
    expect(await consumeFilmWaiver(part.token, part.user)).toBe('paid');
  });

  it('the free-video waiver: one spend, owner-bound, restorable', async () => {
    const user = await newUser(0);
    const token = tokenId();
    expect(await recordFilmWaiver(token, user, { kind: 'free' })).toBe(true);
    expect(await consumeFilmWaiver(token, await newUser(0))).toBe('none');
    expect(await consumeFilmWaiver(token, user)).toBe('free');
    expect(await consumeFilmWaiver(token, user)).toBe('spent');
    await restoreFilmWaiver(token, user);
    expect(await consumeFilmWaiver(token, user)).toBe('free');
  });

  it('the table refuses a free row that carries credits or a paid row without a ref', async () => {
    const user = await newUser(0);
    const bad1 = await db.from('film_payment_waivers').insert({ token_id: tokenId(), user_id: user, kind: 'free', credits: 5 });
    const bad2 = await db.from('film_payment_waivers').insert({ token_id: tokenId(), user_id: user, kind: 'paid', credits: 5 });
    expect(bad1.error).not.toBeNull();
    expect(bad2.error).not.toBeNull();
  });

  it('anon and a signed-in user can neither call the functions nor read or write the table', async () => {
    const f = await paidFilm();
    await recordFilmWaiver(f.token, f.user, { kind: 'paid', credits: f.credits, ref: f.ref });
    for (const role of [clientAs({ role: 'anon' }), clientAs({ role: 'authenticated', sub: f.user })]) {
      for (const fn of ['record_film_waiver', 'consume_film_waiver', 'restore_film_waiver']) {
        const r = await role.rpc(fn, { p_token: f.token, p_user: f.user, p_kind: 'free', p_credits: 0, p_ref: null });
        expect(r.error).not.toBeNull();
      }
      const read = await role.from('film_payment_waivers').select('token_id').eq('token_id', f.token);
      expect(read.error).not.toBeNull();
      const write = await role.from('film_payment_waivers').update({ consumed_at: new Date().toISOString() }).eq('token_id', f.token);
      expect(write.error).not.toBeNull();
    }
    expect(await consumeFilmWaiver(f.token, f.user)).toBe('paid'); // untouched
  });

  it('defect 44 end to end: Redis gone, the second function finds the payment in the database and the stitch is not charged again', async () => {
    const f = await paidFilm(240);
    await recordFilmWaiver(f.token, f.user, { kind: 'paid', credits: f.credits, ref: f.ref });
    // /api/video/assemble in ANOTHER function: no Redis marker, no status record.
    const first = await consumeFilmWaiver(f.token, f.user);
    expect(isFilmPaidUpstream(null, null, f.user, first)).toBe(true);
    const replay = await consumeFilmWaiver(f.token, f.user);
    expect(isFilmPaidUpstream(null, null, f.user, replay)).toBe(false);
    expect(await balance(f.user)).toBe(1000 - 240);
  });
});
