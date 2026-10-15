/** @jest-environment node */
/** Real isolated PostgreSQL/PostgREST queue and ledger; Google, Redis and Storage remain injected.
 * This suite is not live-provider or RLS evidence. It refuses non-loopback database origins. */
import { createHmac } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';
import { fakeImage, imageRequest } from './testing';
import { quoteImage, startImage, workImage, imageStatus, cancelImage, sweepImages } from './engine';
import { liveImageDeps } from './live';
import { ImageError } from './errors';

const REST = process.env.LEASE_PG_REST_URL ?? '';
const SECRET = process.env.LEASE_PG_JWT_SECRET ?? '';
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(REST);
const suite = REST && SECRET && local ? describe : describe.skip;
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const head = b64({ alg: 'HS256', typ: 'JWT' });
const body = b64({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 3600 });
const jwt = head + '.' + body + '.' + createHmac('sha256', SECRET).update(head + '.' + body).digest('base64url');
const db = new PostgrestClient(REST || 'http://127.0.0.1:1', { headers: { Authorization: 'Bearer ' + jwt } });
jest.mock('server-only', () => ({}));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => db }));
const A = '0e000000-0000-4000-8000-00000000000a';
const B = '0e000000-0000-4000-8000-00000000000b';
async function fixture() {
  const f = await fakeImage();
  const live = liveImageDeps();
  f.clock.now = Date.now();
  Object.assign(f.deps, { store: live.store, reserve: live.reserve, refund: live.refund });
  return f;
}
async function balance() {
  const { data, error } = await db.from('profiles').select('credits_balance').eq('id', A).single();
  if (error) throw error;
  return data.credits_balance as number;
}
async function ledger() {
  const { data, error } = await db.from('credit_ledger').select('delta').eq('user_id', A);
  if (error) throw error;
  return data as Array<{ delta: number }>;
}
suite('Image Studio with real isolated queue and hardened credit ledger', () => {
  jest.setTimeout(30_000);
  beforeEach(async () => {
    for (const table of ['generation_jobs', 'credit_ledger']) {
      const { error } = await db.from(table).delete().in('user_id', [A, B]);
      if (error) throw error;
    }
    const { error } = await db.from('profiles').upsert([
      { id: A, email: 'image-a@local.test', credits_balance: 1000 },
      { id: B, email: 'image-b@local.test', credits_balance: 1000 },
    ]);
    if (error) throw error;
  });
  test('quote writes nothing; eight confirmations and workers produce one job, one debit, one injected render', async () => {
    const f = await fixture(), q = await quoteImage(f.deps, A, imageRequest());
    expect(await balance()).toBe(1000);
    expect(await ledger()).toEqual([]);
    const empty = await db.from('generation_jobs').select('id').eq('user_id', A);
    expect(empty.error).toBeNull(); expect(empty.data).toEqual([]);
    const starts = await Promise.all(Array.from({ length: 8 }, () => startImage(f.deps, A, q.plan, q.token, true)));
    expect(starts.filter(s => !s.replay)).toHaveLength(1);
    await Promise.all(Array.from({ length: 8 }, (_, n) => workImage(f.deps, q.jobId, 'pg-worker-' + n)));
    expect(f.deps.generate).toHaveBeenCalledTimes(1);
    expect(f.deps.save).toHaveBeenCalledTimes(1);
    expect(await balance()).toBe(1000 - q.credits);
    expect(await ledger()).toEqual([{ delta: -q.credits }]);
    expect((await imageStatus(f.deps, A, q.jobId)).view.status).toBe('completed');
    expect((await startImage(f.deps, A, q.plan, q.token, true)).replay).toBe(true);
    const fresh = await fixture();
    expect((await imageStatus(fresh.deps, A, q.jobId)).view.status).toBe('completed');
    await expect(imageStatus(fresh.deps, B, q.jobId)).rejects.toMatchObject({ code: 'not_found' });
    expect(f.ticks.size).toBe(0);
  });
  test('provider failure refunds once; repeated sweeps preserve real balance and debit/refund rows', async () => {
    const f = await fixture(), q = await quoteImage(f.deps, A, imageRequest());
    await startImage(f.deps, A, q.plan, q.token, true);
    f.deps.generate = jest.fn(async () => { throw new ImageError('provider_failed', 'isolated injection'); });
    await workImage(f.deps, q.jobId, 'fail');
    await sweepImages(f.deps, 'sweep-1'); await sweepImages(f.deps, 'sweep-2');
    expect((await imageStatus(f.deps, A, q.jobId)).view.status).toBe('failed');
    expect(await balance()).toBe(1000);
    expect((await ledger()).map(x => x.delta).sort((a,b) => a-b)).toEqual([-q.credits, q.credits]);
    expect(f.deps.generate).toHaveBeenCalledTimes(1);
    expect(f.ticks.size).toBe(0);
  });
  test('foreign cancellation is refused; owner cancellation refunds and prevents dispatch', async () => {
    const f = await fixture(), q = await quoteImage(f.deps, A, imageRequest());
    await startImage(f.deps, A, q.plan, q.token, true);
    await expect(cancelImage(f.deps, B, q.jobId)).rejects.toMatchObject({ code: 'not_found' });
    expect(await balance()).toBe(1000 - q.credits);
    expect((await cancelImage(f.deps, A, q.jobId)).status).toBe('cancelled');
    expect((await workImage(f.deps, q.jobId, 'late')).ran).toBe(false);
    expect(f.deps.generate).not.toHaveBeenCalled();
    expect(await balance()).toBe(1000);
    expect((await ledger()).map(x => x.delta).sort((a,b) => a-b)).toEqual([-q.credits, q.credits]);
  });
});
