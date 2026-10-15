/** @jest-environment node */
/**
 * Video Core v1.0 final hardening, Phase 1 — a film's payment and its stitches on a REAL ledger, through the real PostgREST
 * client, against a throwaway Postgres 16 + PostgREST (scripts/lease-isolation/run.sh), in the two states Production can be in:
 *   FILM_PHASE=before — migration 20261014a not applied (Production before 2026-10-15): the ledger is the payment's durable witness and
 *                       the Redis/memory cache the waiver's; a paid film whose cache is gone is STOPPED, never billed again.
 *   FILM_PHASE=after  — supabase/migrations/20261014a_film_billing.sql applied: one charge per film, the
 *                       stitch and one re-stitch free, concurrent stitches serialised on a lease that outlives the route,
 *                       crash recovery by lease expiry, owner-bound, locked to the service role.
 * No Redis anywhere in this suite: everything durable is in the database, and the process memory is the only cache.
 *
 * Opt-in: runs only when LEASE_PG_REST_URL, LEASE_PG_JWT_SECRET and FILM_PHASE are set, and never against a URL that is not
 * on this machine. The accounts are the fixed throwaway ids seeded by scripts/lease-isolation/schema.sql.
 */
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

const REST = process.env.LEASE_PG_REST_URL ?? '';
const SECRET = process.env.LEASE_PG_JWT_SECRET ?? '';
const PHASE = process.env.FILM_PHASE ?? '';
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(REST);
const suite = REST && SECRET && local && (PHASE === 'before' || PHASE === 'after') ? describe : describe.skip;

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

import { deductCredits, refundCredits } from '../orchestrator/ledger';
import { __setStoreClientForTests } from '../orchestrator/idempotencyStore';
import { claimPaidStartKey, releaseIdempotencyKey } from '../orchestrator/idempotency';
import { recordFilmMaster, recordFilmPaid } from './filmStatusStore';
import {
  decideFilmWaiver, filmChargeRef, leaseFilmWaiver, recordFilmBilling, settleFilmWaiver, FILM_WAIVER_LEASE_SEC,
} from './filmBilling';

// The two runs share one database: 'before' takes accounts 1–8, 'after' 9–24 (scripts/lease-isolation/schema.sql seeds 24).
const account = (n: number) => `0e000000-0000-4000-8000-0000000f00${n.toString(16).padStart(2, '0')}`;
let nextAccount = PHASE === 'before' ? 1 : 9;
async function newUser(credits: number): Promise<string> {
  const id = account(nextAccount++);
  const { error } = await db.from('profiles').upsert({ id, email: `film-${id}@local.test`, credits_balance: credits });
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
type Row = { kind: string; credits: number; charge_ref: string | null; waivers_total: number; waivers_used: number; lease_id: string | null; lease_until: string | null; updated_at: string };
async function row(uid: string, token: string): Promise<Row | null> {
  const { data } = await db.from('film_billing').select('*').eq('user_id', uid).eq('token_id', token).maybeSingle();
  return (data as Row | null) ?? null;
}
const newToken = () => `f${randomBytes(8).toString('hex')}`;
/** The film start, as lib/chat/filmComposite takes it: the quote debited under the film's own ref, then recorded. */
async function startPaidFilm(uid: string, credits: number): Promise<string> {
  const token = newToken();
  expect((await deductCredits(uid, credits, filmChargeRef(token))).ok).toBe(true);
  return token;
}
/** Another instance (or the same one after a cold start): fresh module state, empty process memory, the same database. */
function freshInstance(): typeof import('./filmBilling') {
  let mod!: typeof import('./filmBilling');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./filmBilling');
  });
  return mod;
}

const ENV = { ...process.env };
beforeEach(() => {
  process.env = { ...ENV, SUPABASE_URL: REST, SUPABASE_SERVICE_ROLE_KEY: 'local-only' };
  for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[k];
  __setStoreClientForTests(() => db);
});
afterAll(() => { process.env = ENV; __setStoreClientForTests(null); });

suite(`a film's payment and its stitches on a real ledger (${PHASE} 20261014a)`, () => {
  if (PHASE === 'before') {
    it('not provisioned (Production today): the durable store answers unavailable', async () => {
      const { error } = await db.rpc('lease_film_waiver', { p_user: account(1), p_token: newToken(), p_lease_id: 'probe', p_lease_sec: 660 });
      expect(error?.message ?? '').toMatch(/Could not find the function/);
      expect(await recordFilmBilling({ uid: account(1), tokenId: newToken(), kind: 'free', credits: 0, ref: null })).toBe('unavailable');
      expect(await leaseFilmWaiver(account(1), newToken(), 'probe')).toEqual({ state: 'unavailable' });
    });

    it('DEFECT 44 on a real ledger: a paid film whose cache is gone (Redis down, expired, another instance) is STOPPED, not billed twice', async () => {
      const u = await newUser(100);
      const token = await startPaidFilm(u, 13);
      expect(await decideFilmWaiver(u, token, randomUUID())).toEqual({ action: 'stop', reason: 'waiver_unknown' });
      expect(await balance(u)).toBe(87);
      expect(await debits(u, filmChargeRef(token))).toBe(1);
    });

    it('with the cache still alive the old waivers hold: the stitch and the re-stitch are free, the third is billed', async () => {
      const u = await newUser(100);
      const token = await startPaidFilm(u, 13);
      await recordFilmPaid(token, { uid: u, credits: 13, ref: filmChargeRef(token) });
      expect(await decideFilmWaiver(u, token, randomUUID())).toEqual({ action: 'waive', via: 'cache' });
      await recordFilmMaster(token, 'https://media.local.test/master.mp4', null, u); // the stitch delivered
      expect(await decideFilmWaiver(u, token, randomUUID())).toEqual({ action: 'waive', via: 'cache' }); // the re-stitch
      expect(await decideFilmWaiver(u, token, randomUUID())).toEqual({ action: 'bill' }); // both proven delivered
      expect(await balance(u)).toBe(87);
    });

    it('two instances: the one WITHOUT the cache entry (a cold start) stops instead of billing the paid film', async () => {
      const u = await newUser(100);
      const token = await startPaidFilm(u, 13);
      await recordFilmPaid(token, { uid: u, credits: 13, ref: filmChargeRef(token) }); // in THIS instance's memory only
      expect(await freshInstance().decideFilmWaiver(u, token, randomUUID())).toEqual({ action: 'stop', reason: 'waiver_unknown' });
      expect(await balance(u)).toBe(87);
    });

    it('a film nobody paid for (no debit under its ref) is billed as before', async () => {
      const u = await newUser(100);
      expect(await decideFilmWaiver(u, newToken(), randomUUID())).toEqual({ action: 'bill' });
    });
    return;
  }

  it.each([
    ['anon', { role: 'anon' }],
    ['a signed-in user', { role: 'authenticated', sub: account(9) }],
  ])('%s can neither call the functions nor read or write the table', async (_who, claims) => {
    const as = clientAs(claims);
    const token = newToken();
    for (const [fn, args] of [
      ['record_film_billing', { p_user: account(9), p_token: token, p_kind: 'free', p_credits: 0, p_ref: null }],
      ['lease_film_waiver', { p_user: account(9), p_token: token, p_lease_id: 'x', p_lease_sec: 660 }],
      ['settle_film_waiver', { p_user: account(9), p_token: token, p_lease_id: 'x', p_delivered: true }],
    ] as const) {
      expect((await as.rpc(fn, args)).error?.code).toBe('42501');
    }
    expect((await as.from('film_billing').select('token_id')).error?.code).toBe('42501');
    expect((await as.from('film_billing').insert({ user_id: account(9), token_id: token, kind: 'free', waivers_total: 1 })).error?.code).toBe('42501');
  });

  it('a "paid" row is the ledger’s word: without a debit under its ref (or with someone else’s) it is refused and nothing is written', async () => {
    const payer = await newUser(100);
    const other = await newUser(100);
    const token = await startPaidFilm(payer, 13);
    const forged = newToken();
    const direct = await db.rpc('record_film_billing', { p_user: payer, p_token: forged, p_kind: 'paid', p_credits: 13, p_ref: filmChargeRef(forged) });
    expect(direct.error?.message ?? '').toMatch(/film_charge_not_found/);
    expect(await recordFilmBilling({ uid: other, tokenId: token, kind: 'paid', credits: 13, ref: filmChargeRef(token) })).toBe('unavailable');
    expect(await row(payer, forged)).toBeNull();
    expect(await row(other, token)).toBeNull();
  });

  it('the whole life of a paid film: ONE charge; the stitch and the re-stitch free; the third billed; the first record stands', async () => {
    const u = await newUser(100);
    const token = await startPaidFilm(u, 13);
    expect(await recordFilmBilling({ uid: u, tokenId: token, kind: 'paid', credits: 13, ref: filmChargeRef(token) })).toBe('recorded');
    expect(await recordFilmBilling({ uid: u, tokenId: token, kind: 'paid', credits: 99, ref: filmChargeRef(token) })).toBe('exists');
    expect((await row(u, token))?.credits).toBe(13);

    const first = await decideFilmWaiver(u, token, 'stitch-1');
    expect(first).toEqual({ action: 'waive', via: 'durable', leaseId: 'stitch-1', kind: 'paid' });
    expect(await settleFilmWaiver(u, token, 'stitch-1', true)).toBe(true);
    expect((await decideFilmWaiver(u, token, 'restitch-1')).action).toBe('waive');
    expect(await settleFilmWaiver(u, token, 'restitch-1', true)).toBe(true);
    expect(await decideFilmWaiver(u, token, 'third')).toEqual({ action: 'bill' });

    expect(await balance(u)).toBe(87);
    expect(await debits(u, filmChargeRef(token))).toBe(1);
    expect(await row(u, token)).toMatchObject({ waivers_used: 2, waivers_total: 2, lease_id: null });
  });

  it('20 parallel stitches of one paid film on TWO instances: exactly one gets the waiver, 19 are busy; nothing is charged', async () => {
    const u = await newUser(100);
    const token = await startPaidFilm(u, 13);
    await recordFilmBilling({ uid: u, tokenId: token, kind: 'paid', credits: 13, ref: filmChargeRef(token) });
    const other = freshInstance();
    const answers = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? other.decideFilmWaiver : decideFilmWaiver)(u, token, `race-${i}`)));
    const winners = answers.filter((a) => a.action === 'waive');
    expect(winners).toHaveLength(1);
    expect(answers.filter((a) => a.action === 'busy')).toHaveLength(19);
    const winner = winners[0] as { leaseId: string };
    expect((await row(u, token))?.lease_id).toBe(winner.leaseId);
    expect(await settleFilmWaiver(u, token, winner.leaseId, true)).toBe(true);
    expect((await other.decideFilmWaiver(u, token, 'after-race')).action).toBe('waive'); // the re-stitch, on the other instance
    expect(await balance(u)).toBe(87);
  });

  it('a failed stitch hands its waiver back; a crashed one keeps it only until its lease expires (crash recovery)', async () => {
    const u = await newUser(100);
    const token = await startPaidFilm(u, 13);
    await recordFilmBilling({ uid: u, tokenId: token, kind: 'paid', credits: 13, ref: filmChargeRef(token) });

    expect((await decideFilmWaiver(u, token, 'failed')).action).toBe('waive');
    expect(await settleFilmWaiver(u, token, 'failed', false)).toBe(true);
    expect(await row(u, token)).toMatchObject({ waivers_used: 0, lease_id: null });

    expect((await decideFilmWaiver(u, token, 'crashed')).action).toBe('waive'); // …and the function dies without settling
    expect(await decideFilmWaiver(u, token, 'too-soon')).toEqual({ action: 'busy' });
    await db.from('film_billing').update({ lease_until: new Date(Date.now() - 1000).toISOString() }).eq('user_id', u).eq('token_id', token);
    expect((await decideFilmWaiver(u, token, 'recovered')).action).toBe('waive');
    // The crashed stitch waking late cannot spend the waiver it no longer holds.
    expect(await settleFilmWaiver(u, token, 'crashed', true)).toBe(false);
    expect((await row(u, token))?.waivers_used).toBe(0);
    expect(await settleFilmWaiver(u, token, 'recovered', true)).toBe(true);
    expect((await row(u, token))?.waivers_used).toBe(1);
    expect(await balance(u)).toBe(87);
  });

  it('a render as long as the route allows never loses its lease: it runs 660 s, past the 600 s maxDuration', async () => {
    const u = await newUser(100);
    const token = await startPaidFilm(u, 13);
    await recordFilmBilling({ uid: u, tokenId: token, kind: 'paid', credits: 13, ref: filmChargeRef(token) });
    await decideFilmWaiver(u, token, 'long');
    const r = await row(u, token);
    const secs = (Date.parse(r!.lease_until!) - Date.parse(r!.updated_at)) / 1000;
    expect(secs).toBe(FILM_WAIVER_LEASE_SEC);
    expect(FILM_WAIVER_LEASE_SEC).toBeGreaterThan(600);
  });

  it('a row lost at start is rebuilt from the LEDGER on the first stitch (self-heal), with the ledger’s own numbers', async () => {
    const u = await newUser(100);
    const token = await startPaidFilm(u, 13); // charged, but the record never landed
    expect(await row(u, token)).toBeNull();
    expect(await decideFilmWaiver(u, token, 'heal')).toEqual({ action: 'waive', via: 'durable', leaseId: 'heal', kind: 'paid' });
    expect(await row(u, token)).toMatchObject({ kind: 'paid', credits: 13, charge_ref: filmChargeRef(token), waivers_total: 2 });
  });

  it('a partly refunded film (a dead scene handed back at dispatch) is still paid, at its net', async () => {
    const u = await newUser(100);
    const token = await startPaidFilm(u, 39);
    expect((await refundCredits(u, 13, `${filmChargeRef(token)}:refund:dispatch`)).ok).toBe(true);
    expect(await balance(u)).toBe(74);
    expect((await decideFilmWaiver(u, token, 'net')).action).toBe('waive');
    expect((await row(u, token))?.credits).toBe(26);
  });

  it('payment reuse: another user presenting the paid film’s token is billed for their own stitch; the payer’s waivers are untouched', async () => {
    const payer = await newUser(100);
    const stranger = await newUser(100);
    const token = await startPaidFilm(payer, 13);
    await recordFilmBilling({ uid: payer, tokenId: token, kind: 'paid', credits: 13, ref: filmChargeRef(token) });
    expect(await decideFilmWaiver(stranger, token, 'reuse')).toEqual({ action: 'bill' });
    expect(await row(stranger, token)).toBeNull();
    expect(await row(payer, token)).toMatchObject({ waivers_used: 0, lease_id: null });
    // …and the payer's other film is not covered by this payment.
    expect(await decideFilmWaiver(payer, newToken(), 'other-film')).toEqual({ action: 'bill' });
  });

  it('a free film covers exactly its one stitch', async () => {
    const u = await newUser(0);
    const token = newToken();
    expect(await recordFilmBilling({ uid: u, tokenId: token, kind: 'free', credits: 0, ref: null })).toBe('recorded');
    expect(await decideFilmWaiver(u, token, 'free-1')).toEqual({ action: 'waive', via: 'durable', leaseId: 'free-1', kind: 'free' });
    expect(await settleFilmWaiver(u, token, 'free-1', true)).toBe(true);
    expect(await decideFilmWaiver(u, token, 'free-2')).toEqual({ action: 'bill' });
  });

  it('bad input is refused by the functions themselves', async () => {
    const u = account(9);
    expect((await db.rpc('lease_film_waiver', { p_user: u, p_token: newToken(), p_lease_id: 'x', p_lease_sec: 30 })).error?.code).toBe('22023');
    expect((await db.rpc('lease_film_waiver', { p_user: u, p_token: 'not-a-token', p_lease_id: 'x', p_lease_sec: 660 })).error?.code).toBe('22023');
    expect((await db.rpc('record_film_billing', { p_user: u, p_token: newToken(), p_kind: 'gift', p_credits: 0, p_ref: null })).error?.code).toBe('22023');
    expect((await db.rpc('record_film_billing', { p_user: u, p_token: newToken(), p_kind: 'free', p_credits: -1, p_ref: null })).error?.code).toBe('22023');
  });

  it('the film START on the same database: 20 parallel presses → one claimed; release lets an honest retry through', async () => {
    const u = await newUser(100);
    const key = `film-start:${randomUUID()}`;
    const answers = await Promise.all(Array.from({ length: 20 }, () => claimPaidStartKey(u, key, 3600)));
    expect(answers.filter((a) => a === 'claimed')).toHaveLength(1);
    expect(answers.filter((a) => a === 'held')).toHaveLength(19);
    await releaseIdempotencyKey(u, key);
    expect(await claimPaidStartKey(u, key, 3600)).toBe('claimed');
    await releaseIdempotencyKey(u, key);
  });
});
