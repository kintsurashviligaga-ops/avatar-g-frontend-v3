/** @jest-environment node */
jest.mock('server-only', () => ({}));

import { __setStoreClientForTests, storeClaim, storeRelease } from './idempotencyStore';
import { claimIdempotencyKey, releaseIdempotencyKey } from './idempotency';

type Answer = { data: unknown; error: { code?: string; message?: string } | null };
function fakeClient(answer: (fn: string, args: Record<string, unknown>) => Answer | Promise<Answer>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return { calls, client: { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return answer(fn, args); } } };
}

const ENV = { ...process.env };
beforeEach(() => {
  process.env = { ...ENV, SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_ROLE_KEY: 'unit-test-only' };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.KV_REST_API_URL;
});
afterAll(() => { process.env = ENV; __setStoreClientForTests(null); });

describe('R2: the duplicate guard in the database when Redis cannot answer', () => {
  test('the first caller is let through, the duplicate is refused', async () => {
    const seen = new Set<string>();
    const f = fakeClient((_fn, a) => { const k = `${a.p_owner}|${a.p_key}`; const first = !seen.has(k); seen.add(k); return { data: first, error: null }; });
    __setStoreClientForTests(() => f.client);
    expect(await claimIdempotencyKey('u1', 'assemble:abc', 60)).toBe(true);
    expect(await claimIdempotencyKey('u1', 'assemble:abc', 60)).toBe(false);
    expect(await claimIdempotencyKey('u2', 'assemble:abc', 60)).toBe(true);
    expect(f.calls[0]).toEqual({ fn: 'claim_request_idempotency', args: { p_owner: 'u1', p_key: 'assemble:abc', p_window_sec: 60 } });
  });

  test('release frees the key in the database', async () => {
    const f = fakeClient(() => ({ data: null, error: null }));
    __setStoreClientForTests(() => f.client);
    await releaseIdempotencyKey('u1', 'chat-paid-dispatch');
    expect(f.calls).toEqual([{ fn: 'release_request_idempotency', args: { p_owner: 'u1', p_key: 'chat-paid-dispatch' } }]);
  });

  test('not provisioned yet (Production before the proposal): fails open, and stops asking for 10 minutes', async () => {
    const f = fakeClient(() => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.claim_request_idempotency' } }));
    __setStoreClientForTests(() => f.client);
    expect(await storeClaim('u1', 'k', 60)).toBe('unavailable');
    expect(await claimIdempotencyKey('u1', 'k', 60)).toBe(true);
    expect(await claimIdempotencyKey('u1', 'k', 60)).toBe(true);
    await storeRelease('u1', 'k');
    expect(f.calls).toHaveLength(1);
  });

  test('any other database error, a throw, or an odd answer fails open (never blocks a paying user)', async () => {
    for (const answer of [
      () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }),
      () => { throw new Error('fetch failed'); },
      () => ({ data: 'yes', error: null }),
    ]) {
      __setStoreClientForTests(() => fakeClient(answer as () => Answer).client);
      expect(await storeClaim('u1', 'k', 60)).toBe('unavailable');
      expect(await claimIdempotencyKey('u1', 'k', 60)).toBe(true);
    }
  });

  test('without a service-role configuration it never calls the database', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const f = fakeClient(() => ({ data: false, error: null }));
    __setStoreClientForTests(() => f.client);
    expect(await claimIdempotencyKey('u1', 'k', 60)).toBe(true);
    expect(f.calls).toHaveLength(0);
  });

  test('the window is clamped to what the function accepts (1 … 3600 s)', async () => {
    const f = fakeClient(() => ({ data: true, error: null }));
    __setStoreClientForTests(() => f.client);
    await storeClaim('u1', 'a', 0);
    await storeClaim('u1', 'b', 90.4);
    await storeClaim('u1', 'c', 86_400);
    expect(f.calls.map((c) => c.args.p_window_sec)).toEqual([1, 90, 3600]);
  });
});
