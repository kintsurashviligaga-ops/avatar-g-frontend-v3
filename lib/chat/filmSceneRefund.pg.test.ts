/** @jest-environment node */
/**
 * R3-A on a REAL ledger, through the real PostgREST client, against the throwaway Postgres 16 + PostgREST of
 * scripts/lease-isolation/run.sh with proposal 20261014a applied (FILM_PHASE=after): a scene Google failed is given back
 * once, capped by what the film still holds, only to its payer, and only by the service role. Google itself is not called:
 * the verdict is injected (its classification: lib/chat/filmSceneRefund.test.ts).
 *
 * Opt-in: runs only when LEASE_PG_REST_URL, LEASE_PG_JWT_SECRET and FILM_PHASE=after are set, and never against a URL that
 * is not on this machine. Accounts 25–40 of the throwaway ids seeded by scripts/lease-isolation/schema.sql.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

const REST = process.env.LEASE_PG_REST_URL ?? '';
const SECRET = process.env.LEASE_PG_JWT_SECRET ?? '';
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(REST);
const suite = REST && SECRET && local && process.env.FILM_PHASE === 'after' ? describe : describe.skip;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwtFor(claims: Record<string, unknown>): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const body = b64({ ...claims, iat: now, exp: now + 3600 });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
function clientAs(claims: Record<string, unknown>): PostgrestClient {
  const jwt = REST && SECRET ? jwtFor(claims) : '';
  return new PostgrestClient(REST || 'http://127.0.0.1:1', { headers: { apikey: jwt, Authorization: `Bearer ${jwt}` } });
}
const db = clientAs({ role: 'service_role' });

jest.mock('server-only', () => ({}));
jest.mock('../observability/report-error', () => ({ reportError: () => undefined }));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => db, createSupabaseServerClient: () => db }));
jest.mock('../veo/engine', () => ({ pollVeoClip: jest.fn() }));

import { deductCredits, refundCredits } from '../orchestrator/ledger';
import { filmChargeRef, pendingFilmScenes, recordFilmBilling, recordFilmScenes, settleFilmScene } from './filmBilling';
import { settleFailedFilmScenes } from './filmSceneRefund';
import type { VeoPollOutcome } from '../veo/types';

const account = (n: number) => `0e000000-0000-4000-8000-0000000f00${n.toString(16).padStart(2, '0')}`;
let nextAccount = 25;
async function newUser(credits: number): Promise<string> {
  const id = account(nextAccount++);
  const { error } = await db.from('profiles').upsert({ id, email: `scene-${id}@local.test`, credits_balance: credits });
  if (error) throw new Error(error.message);
  return id;
}
async function balance(id: string): Promise<number> {
  const { data } = await db.from('profiles').select('credits_balance').eq('id', id).single();
  return (data as { credits_balance: number }).credits_balance;
}
async function credited(id: string, ref: string): Promise<number> {
  const { data } = await db.from('credit_ledger').select('delta').eq('user_id', id).eq('metadata->>ref', ref).gt('delta', 0);
  return ((data ?? []) as Array<{ delta: number }>).reduce((s, r) => s + r.delta, 0);
}
async function scene(uid: string, token: string, ordinal: number) {
  const { data } = await db.from('film_scenes').select('state, refunded').eq('user_id', uid).eq('token_id', token).eq('ordinal', ordinal).maybeSingle();
  return data as { state: string; refunded: number } | null;
}
const newToken = () => `f${randomBytes(8).toString('hex')}`;
const op = (n: number) => `projects/p/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/op-${n}`;

/** A paid film as the start leaves it: the quote debited under its ref, a dispatch refund, the record, the scene shares. */
async function startPaidFilm(uid: string, quote: number, scenes: number, deadAtDispatch: number[] = []) {
  const token = newToken();
  const ref = filmChargeRef(token);
  expect((await deductCredits(uid, quote, ref)).ok).toBe(true);
  const per = Math.floor(quote / scenes);
  if (deadAtDispatch.length) expect((await refundCredits(uid, per * deadAtDispatch.length, `${ref}:refund:dispatch`)).ok).toBe(true);
  const net = quote - per * deadAtDispatch.length;
  expect(await recordFilmBilling({ uid, tokenId: token, kind: 'paid', credits: net, ref })).toBe('recorded');
  const shares = Array.from({ length: scenes }, (_, i) => i + 1)
    .filter((n) => !deadAtDispatch.includes(n))
    .map((n) => ({ ordinal: n, operation: op(n), credits: per }));
  expect(await recordFilmScenes(uid, token, shares)).toBe('recorded');
  return { token, ref, per };
}

const ENV = { ...process.env };
beforeEach(() => { process.env = { ...ENV, SUPABASE_URL: REST, SUPABASE_SERVICE_ROLE_KEY: 'local-only' }; });
afterAll(() => { process.env = ENV; });

suite('R3-A: a scene Google failed, on a real ledger (20261014a applied)', () => {
  it.each([
    ['anon', { role: 'anon' }],
    ['a signed-in user', { role: 'authenticated', sub: account(25) }],
  ])('%s can neither call the scene functions nor read or write the table', async (_who, claims) => {
    const as = clientAs(claims);
    const token = newToken();
    for (const [fn, args] of [
      ['record_film_scenes', { p_user: account(25), p_token: token, p_scenes: [{ ordinal: 1, operation: op(1), credits: 1 }] }],
      ['pending_film_scenes', { p_user: account(25), p_token: token }],
      ['settle_film_scene', { p_user: account(25), p_token: token, p_ordinal: 1, p_failed: true }],
    ] as const) {
      expect((await as.rpc(fn, args)).error?.code).toBe('42501');
    }
    expect((await as.from('film_scenes').select('ordinal')).error?.code).toBe('42501');
  });

  it('the whole life: 4 × 25 film, one dead at dispatch; a Google failure gives 25 back ONCE; a rendered scene stays paid', async () => {
    const u = await newUser(100);
    const { token, ref } = await startPaidFilm(u, 100, 4, [3]);
    expect(await balance(u)).toBe(25); // 100 − 100 + 25 (dispatch)
    expect((await pendingFilmScenes(u, token))?.map((s) => s.ordinal)).toEqual([1, 2, 4]);

    expect(await settleFilmScene(u, token, 2, true)).toBe(25);
    expect(await settleFilmScene(u, token, 2, true)).toBe(0); // settled once
    expect(await settleFilmScene(u, token, 1, false)).toBe(0); // rendered → kept
    expect(await settleFilmScene(u, token, 1, true)).toBe(0); // a kept scene cannot be refunded later
    expect(await balance(u)).toBe(50);
    expect(await credited(u, `${ref}:refund:scene:2`)).toBe(25);
    expect(await credited(u, `${ref}:refund:scene:1`)).toBe(0);
    expect(await scene(u, token, 2)).toEqual({ state: 'refunded', refunded: 25 });
    expect(await scene(u, token, 1)).toEqual({ state: 'kept', refunded: 0 });
    expect((await pendingFilmScenes(u, token))?.map((s) => s.ordinal)).toEqual([4]);
  });

  it('20 parallel settlements of the same failed scene (two polls, two devices): exactly one share comes back', async () => {
    const u = await newUser(100);
    const { token, ref } = await startPaidFilm(u, 100, 4);
    const answers = await Promise.all(Array.from({ length: 20 }, () => settleFilmScene(u, token, 3, true)));
    expect(answers.filter((a) => a === 25)).toHaveLength(1);
    expect(answers.filter((a) => a === 0)).toHaveLength(19);
    expect(await credited(u, `${ref}:refund:scene:3`)).toBe(25);
    expect(await balance(u)).toBe(25);
  });

  it('the cap: a share never exceeds what the film still holds (a film already refunded in full gives nothing more)', async () => {
    const u = await newUser(50);
    const { token, ref } = await startPaidFilm(u, 13, 1);
    expect((await refundCredits(u, 13, `${ref}:refund`)).ok).toBe(true); // e.g. a manual full refund
    expect(await settleFilmScene(u, token, 1, true)).toBe(0);
    expect(await scene(u, token, 1)).toEqual({ state: 'refunded', refunded: 0 });
    expect(await balance(u)).toBe(50);
  });

  it('owner-bound: another user naming the payer’s film settles nothing and the payer’s scene stays open', async () => {
    const payer = await newUser(100);
    const other = await newUser(0);
    const { token } = await startPaidFilm(payer, 100, 4);
    expect(await settleFilmScene(other, token, 1, true)).toBe(0);
    expect(await pendingFilmScenes(other, token)).toEqual([]);
    expect(await balance(other)).toBe(0);
    expect((await pendingFilmScenes(payer, token))?.map((s) => s.ordinal)).toEqual([1, 2, 3, 4]);
  });

  it('the record: only for a PAID film, and never more than it holds (all-or-nothing)', async () => {
    const u = await newUser(100);
    const free = newToken();
    expect(await recordFilmBilling({ uid: u, tokenId: free, kind: 'free', credits: 0, ref: null })).toBe('recorded');
    const freeRec = await db.rpc('record_film_scenes', { p_user: u, p_token: free, p_scenes: [{ ordinal: 1, operation: op(1), credits: 0 }] });
    expect(freeRec.error?.message ?? '').toMatch(/film_not_paid/);
    const none = await db.rpc('record_film_scenes', { p_user: u, p_token: newToken(), p_scenes: [{ ordinal: 1, operation: op(1), credits: 1 }] });
    expect(none.error?.message ?? '').toMatch(/film_not_paid/);

    const token = newToken();
    const ref = filmChargeRef(token);
    expect((await deductCredits(u, 75, ref)).ok).toBe(true);
    expect(await recordFilmBilling({ uid: u, tokenId: token, kind: 'paid', credits: 75, ref })).toBe('recorded');
    const tooMuch = await db.rpc('record_film_scenes', {
      p_user: u, p_token: token,
      p_scenes: [1, 2, 3, 4].map((n) => ({ ordinal: n, operation: op(n), credits: 25 })), // 100 > 75
    });
    expect(tooMuch.error?.message ?? '').toMatch(/scene_credits_exceed_film/);
    expect(await pendingFilmScenes(u, token)).toEqual([]); // nothing half-written
    // A replay of the start records nothing new; the first record stands.
    const shares = [1, 2, 3].map((n) => ({ ordinal: n, operation: op(n), credits: 25 }));
    expect((await db.rpc('record_film_scenes', { p_user: u, p_token: token, p_scenes: shares })).data).toBe(3);
    expect((await db.rpc('record_film_scenes', { p_user: u, p_token: token, p_scenes: shares })).data).toBe(0);
  });

  it('bad input is refused by the functions themselves', async () => {
    const u = account(25);
    const t = newToken();
    expect((await db.rpc('record_film_scenes', { p_user: u, p_token: 'not-a-token', p_scenes: [] })).error?.code).toBe('22023');
    expect((await db.rpc('record_film_scenes', { p_user: u, p_token: t, p_scenes: [] })).error?.code).toBe('22023');
    expect((await db.rpc('record_film_scenes', { p_user: u, p_token: t, p_scenes: { ordinal: 1 } })).error?.code).toBe('22023');
    expect((await db.rpc('settle_film_scene', { p_user: u, p_token: t, p_ordinal: 1, p_failed: null })).error?.code).toBe('22023');
  });

  it('end to end through the poll’s settlement: Google’s verdicts decide, the recorded operation is the one asked about', async () => {
    const u = await newUser(100);
    const { token } = await startPaidFilm(u, 100, 4);
    const verdicts: Record<string, VeoPollOutcome> = {
      [op(1)]: { state: 'succeeded', videos: [] },
      [op(2)]: { state: 'filtered', reason: 'blocked', supportCodes: [] },
      [op(3)]: { state: 'failed', reason: 'operation expired or unknown', code: 404 }, // proves nothing
      [op(4)]: { state: 'failed', reason: 'Internal error', code: 13, finished: true },
    };
    const asked: string[] = [];
    const deps = {
      pending: pendingFilmScenes,
      settle: settleFilmScene,
      poll: async (operation: string) => { asked.push(operation); return verdicts[operation] ?? { state: 'processing' as const }; },
    };
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    expect(await settleFailedFilmScenes(u, token, [1, 2, 3, 4], deps)).toBe(50);
    expect(asked).toEqual([op(1), op(2), op(3), op(4)]);
    expect(await balance(u)).toBe(50);
    expect((await pendingFilmScenes(u, token))?.map((s) => s.ordinal)).toEqual([3]); // asked again on a later poll
    expect(await settleFailedFilmScenes(u, token, [1, 2, 3, 4], deps)).toBe(0);
    expect(await balance(u)).toBe(50);
  });
});
