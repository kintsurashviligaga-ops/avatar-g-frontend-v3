/** @jest-environment node */
/**
 * R2 — the duplicate guard in the database (lib/orchestrator/idempotencyStore.ts) through the REAL PostgREST client
 * against a throwaway Postgres 16 + PostgREST (scripts/lease-isolation/run.sh), in the two states Production can be in:
 *   IDEM_PHASE=before — the migration is not applied (a local or older database): every claim fails open, as before R2;
 *   IDEM_PHASE=after  — supabase/migrations/20261013a_request_idempotency.sql applied (Production since 2026-10-13): concurrent
 *                       twins get exactly one 'claimed', release frees the key, an expired key can be taken again,
 *                       and neither anon nor a signed-in user can call the functions or read the table.
 *
 * Opt-in: runs only when LEASE_PG_REST_URL, LEASE_PG_JWT_SECRET and IDEM_PHASE are set, and never against a URL that
 * is not on this machine.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

const REST = process.env.LEASE_PG_REST_URL ?? '';
const SECRET = process.env.LEASE_PG_JWT_SECRET ?? '';
const PHASE = process.env.IDEM_PHASE ?? '';
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
const service = clientAs({ role: 'service_role' });

jest.mock('server-only', () => ({}));

import { __setStoreClientForTests, storeClaim, storeRelease } from './idempotencyStore';
import { claimIdempotencyKey, releaseIdempotencyKey } from './idempotency';

const ENV = { ...process.env };
beforeEach(() => {
  // The store only asks the database when a service-role configuration exists; the client itself is the local one.
  process.env = { ...ENV, SUPABASE_URL: REST, SUPABASE_SERVICE_ROLE_KEY: 'local-only' };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.KV_REST_API_URL;
  __setStoreClientForTests(() => service);
});
afterAll(() => { process.env = ENV; __setStoreClientForTests(null); });

suite(`the R2 duplicate guard on a real PostgREST (${PHASE} 20261013a)`, () => {
  if (PHASE === 'before') {
    it('not provisioned (a database without the migration): the store answers unavailable and the guard fails open, as before R2', async () => {
      const { error } = await service.rpc('claim_request_idempotency', { p_owner: 'probe', p_key: 'probe', p_window_sec: 60 });
      expect(error?.message ?? '').toMatch(/Could not find the function/);
      expect(await storeClaim('u-before', 'assemble:k', 60)).toBe('unavailable');
      expect(await claimIdempotencyKey('u-before', 'assemble:k', 60)).toBe(true);
      expect(await claimIdempotencyKey('u-before', 'assemble:k', 60)).toBe(true);
    });
    return;
  }

  it('a double-pressed Start: the first press is let through, the second is refused', async () => {
    const owner = randomUUID();
    expect(await claimIdempotencyKey(owner, 'assemble:0123456789abcdef', 60)).toBe(true);
    expect(await claimIdempotencyKey(owner, 'assemble:0123456789abcdef', 60)).toBe(false);
    // Another user, or another film of the same user, is not a duplicate.
    expect(await claimIdempotencyKey(randomUUID(), 'assemble:0123456789abcdef', 60)).toBe(true);
    expect(await claimIdempotencyKey(owner, 'assemble:fedcba9876543210', 60)).toBe(true);
  });

  it('twenty concurrent presses on separate connections: exactly one is claimed', async () => {
    const owner = `anon:${randomUUID()}`;
    const answers = await Promise.all(Array.from({ length: 20 }, () => storeClaim(owner, 'assemble:race', 60)));
    expect(answers.filter((a) => a === 'claimed')).toHaveLength(1);
    expect(answers.filter((a) => a === 'held')).toHaveLength(19);
    const { data } = await service.from('request_idempotency').select('owner').eq('owner', owner);
    expect(data).toHaveLength(1);
  });

  it('release frees the key at once (a failed render can be retried honestly)', async () => {
    const owner = randomUUID();
    expect(await storeClaim(owner, 'chat-paid-dispatch', 90)).toBe('claimed');
    expect(await storeClaim(owner, 'chat-paid-dispatch', 90)).toBe('held');
    await releaseIdempotencyKey(owner, 'chat-paid-dispatch');
    expect(await storeClaim(owner, 'chat-paid-dispatch', 90)).toBe('claimed');
    await storeRelease(owner, 'chat-paid-dispatch');
  });

  it('an expired key can be taken again; the window is the one asked for', async () => {
    const owner = randomUUID();
    expect(await storeClaim(owner, 'assemble:short', 1)).toBe('claimed');
    expect(await storeClaim(owner, 'assemble:short', 1)).toBe('held');
    await new Promise((r) => setTimeout(r, 1300));
    expect(await storeClaim(owner, 'assemble:short', 1)).toBe('claimed');
    const { data } = await service.from('request_idempotency').select('claimed_at, expires_at').eq('owner', owner).single();
    const row = data as { claimed_at: string; expires_at: string };
    expect(Date.parse(row.expires_at) - Date.parse(row.claimed_at)).toBe(1000);
  });

  it('bad input is refused by the function, and the store fails open on it', async () => {
    const { error } = await service.rpc('claim_request_idempotency', { p_owner: 'x', p_key: 'k', p_window_sec: 0 });
    expect(error?.code).toBe('22023');
    const tooLong = 'k'.repeat(201);
    const { error: e2 } = await service.rpc('claim_request_idempotency', { p_owner: 'x', p_key: tooLong, p_window_sec: 60 });
    expect(e2?.code).toBe('22023');
    expect(await claimIdempotencyKey('x', tooLong, 60)).toBe(true);
  });

  it.each([
    ['anon', { role: 'anon' }],
    ['a signed-in user', { role: 'authenticated', sub: randomUUID() }],
  ])('%s can neither call the functions nor read or write the table', async (_who, claims) => {
    const db = clientAs(claims);
    const claim = await db.rpc('claim_request_idempotency', { p_owner: 'victim', p_key: 'assemble:k', p_window_sec: 60 });
    expect(claim.error?.code).toBe('42501');
    const release = await db.rpc('release_request_idempotency', { p_owner: 'victim', p_key: 'assemble:k' });
    expect(release.error?.code).toBe('42501');
    const read = await db.from('request_idempotency').select('owner');
    expect(read.error?.code).toBe('42501');
    const write = await db.from('request_idempotency').insert({ owner: 'victim', key: 'k', expires_at: new Date().toISOString() });
    expect(write.error?.code).toBe('42501');
  });
});
