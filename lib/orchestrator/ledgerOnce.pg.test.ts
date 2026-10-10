/** @jest-environment node */
/**
 * deductCreditsOnce and reserveProduce({ refuseReplay }) through the REAL supabase-js client against a throwaway
 * Postgres 16 + PostgREST (scripts/lease-isolation/run.sh), in the two states Production can be in:
 *   LEDGER_PHASE=before — Production's functions as they are today (no deduct_credits_once): the ledger-read fallback;
 *   LEDGER_PHASE=after  — supabase/migrations/20261002d applied: the atomic `charged` answer.
 * Either way a replayed ref is refused and charges nothing; after 20261002d, concurrent twins charge once and exactly
 * one of them may render.
 *
 * Opt-in: runs only when LEASE_PG_REST_URL, LEASE_PG_JWT_SECRET and LEDGER_PHASE are set, and never against a URL
 * that is not on this machine.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

const REST = process.env.LEASE_PG_REST_URL ?? '';
const SECRET = process.env.LEASE_PG_JWT_SECRET ?? '';
const PHASE = process.env.LEDGER_PHASE ?? '';
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(REST);
const suite = REST && SECRET && local && (PHASE === 'before' || PHASE === 'after') ? describe : describe.skip;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function serviceJwt(): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ role: 'service_role', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
const jwt = REST && SECRET ? serviceJwt() : '';
const db = new PostgrestClient(REST || 'http://127.0.0.1:1', { headers: { apikey: jwt, Authorization: `Bearer ${jwt}` } });

jest.mock('server-only', () => ({}));
jest.mock('../observability/report-error', () => ({ reportError: () => undefined }));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => db, createSupabaseServerClient: () => db }));

import { deductCreditsOnce } from './ledger';
import { reserveProduce, reservationErrorCode } from './produceBilling';

async function newUser(credits: number): Promise<string> {
  const id = randomUUID();
  const { error } = await db.from('profiles').insert({ id, email: `once-${id}@local.test`, credits_balance: credits });
  if (error) throw new Error(error.message);
  return id;
}
async function balance(id: string): Promise<number> {
  const { data } = await db.from('profiles').select('credits_balance').eq('id', id).single();
  return (data as { credits_balance: number }).credits_balance;
}
async function debits(id: string, ref: string): Promise<number> {
  const { data } = await db.from('credit_ledger').select('id').eq('user_id', id).eq('metadata->>ref', ref).lt('delta', 0);
  return (data ?? []).length;
}

suite(`deductCreditsOnce on a real PostgREST (${PHASE} 20261002d)`, () => {
  it(PHASE === 'after' ? 'deduct_credits_once is provisioned' : 'deduct_credits_once is not provisioned (Production today)', async () => {
    const { error } = await db.rpc('deduct_credits_once', { p_user_id: randomUUID(), p_amount: 1, p_ref: 'probe' });
    if (PHASE === 'after') expect(error?.message ?? '').toMatch(/insufficient_credits/); // a real answer from the function
    else expect(error?.message ?? '').toMatch(/Could not find the function/);
  });

  it('first call charges; a sequential replay is refused and charges nothing', async () => {
    const u = await newUser(100);
    expect(await deductCreditsOnce(u, 30, 'image:k1:fp')).toEqual({ ok: true, balance: 70 });
    const again = await deductCreditsOnce(u, 30, 'image:k1:fp');
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('replay');
    expect(await debits(u, 'image:k1:fp')).toBe(1);
    expect(await balance(u)).toBe(70);
  });

  it('reserveProduce({ refuseReplay }) turns the replay into duplicate_request, not a free render', async () => {
    const u = await newUser(100);
    expect(await reserveProduce(u, 25, 'film:k2:fp', { refuseReplay: true })).toMatchObject({ proceed: true, charged: true, balance: 75 });
    const replay = await reserveProduce(u, 25, 'film:k2:fp', { refuseReplay: true });
    expect(replay).toMatchObject({ proceed: false, charged: false, reason: 'replay' });
    expect(reservationErrorCode(replay)).toBe('duplicate_request');
    expect(await balance(u)).toBe(75);
  });

  it('without refuseReplay (a worker re-reserving its own ref) the idempotent success is unchanged', async () => {
    const u = await newUser(100);
    expect(await reserveProduce(u, 10, 'montage:q:w')).toMatchObject({ proceed: true, charged: true, balance: 90 });
    expect(await reserveProduce(u, 10, 'montage:q:w')).toMatchObject({ proceed: true, charged: true, balance: 90 });
    expect(await debits(u, 'montage:q:w')).toBe(1);
  });

  it('insufficient credits is still insufficient', async () => {
    const u = await newUser(5);
    expect(await deductCreditsOnce(u, 30, 'big')).toMatchObject({ ok: false, reason: 'insufficient' });
  });

  it('a user with no profile row is not charged', async () => {
    const u = randomUUID();
    expect(await deductCreditsOnce(u, 1, 'np')).toMatchObject({ ok: false });
  });

  (PHASE === 'after' ? it : it.skip)('eight concurrent twins: one debit, exactly one may render', async () => {
    const u = await newUser(100);
    const results = await Promise.all(Array.from({ length: 8 }, () => deductCreditsOnce(u, 20, 'twins')));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === 'replay')).toHaveLength(7);
    expect(await debits(u, 'twins')).toBe(1);
    expect(await balance(u)).toBe(80);
  });

  (PHASE === 'before' ? it : it.skip)('concurrent twins before 20261002d: the known window (documented, not hidden)', async () => {
    const u = await newUser(100);
    const results = await Promise.all(Array.from({ length: 8 }, () => deductCreditsOnce(u, 20, 'twins')));
    // The fallback reads, then charges: twins can all pass the read, and the live deduct_credits can debit more than
    // once (the C1 race). What must hold even here: the balance never goes negative and nothing is minted.
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(1);
    const n = await debits(u, 'twins');
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await balance(u)).toBe(100 - 20 * n);
    expect(await balance(u)).toBeGreaterThanOrEqual(0);
  });
});
