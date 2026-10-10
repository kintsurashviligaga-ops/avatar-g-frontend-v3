/** @jest-environment node */
/**
 * The live half of the delivery outbox: the DELIVERY_OUTBOX switch (off in Production until the owner turns it on), the
 * generation_jobs store's filters (the compare-and-set is ONE filtered PATCH), and the kick being a no-op while off.
 */
jest.mock('server-only', () => ({}));
const mockDeliver = jest.fn(async (..._a: unknown[]) => ({ outcome: 'delivered' }));
jest.mock('./outbox', () => ({ ...jest.requireActual('./outbox'), deliver: (...a: unknown[]) => mockDeliver(...a) }));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => ({ from: () => ({}) }) }));

import { deliveryOutboxOn, kickDelivery, outboxRowOf, supabaseOutboxStore } from './outboxLive';

/** A PostgREST query builder that records every filter and answers `answer`. */
function recorder(answer: { data: unknown; error: { message: string } | null }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'update', 'eq', 'in', 'is', 'not', 'gte', 'order', 'limit', 'maybeSingle']) {
    q[m] = (...a: unknown[]) => { calls.push([m, ...a]); return q; };
  }
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(answer).then(res);
  return { calls, client: { from: (t: string) => { calls.push(['from', t]); return q; } } };
}

const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; jest.clearAllMocks(); });

describe('DELIVERY_OUTBOX', () => {
  it('off unless turned on; on by default only on a Vercel Preview', () => {
    expect(deliveryOutboxOn({} as NodeJS.ProcessEnv)).toBe(false);
    expect(deliveryOutboxOn({ VERCEL_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(deliveryOutboxOn({ VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv)).toBe(true);
    expect(deliveryOutboxOn({ VERCEL_ENV: 'preview', DELIVERY_OUTBOX: 'off' } as NodeJS.ProcessEnv)).toBe(false);
    for (const v of ['1', 'true', 'on', ' ON ']) expect(deliveryOutboxOn({ VERCEL_ENV: 'production', DELIVERY_OUTBOX: v } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('the kick does nothing while off, and delivers that one job while on', async () => {
    delete process.env.DELIVERY_OUTBOX;
    delete process.env.VERCEL_ENV;
    kickDelivery('job-1');
    expect(mockDeliver).not.toHaveBeenCalled();
    process.env.DELIVERY_OUTBOX = 'on';
    kickDelivery('job-1');
    await new Promise((r) => setImmediate(r));
    expect(mockDeliver).toHaveBeenCalledTimes(1);
    expect(mockDeliver.mock.calls[0]![1]).toBe('job-1');
  });
});

describe('supabaseOutboxStore (generation_jobs)', () => {
  const report = jest.fn();

  it('the first take: final rows only, no _tell yet, the lease version it read', async () => {
    const r = recorder({ data: [{ id: 'j' }], error: null });
    const store = supabaseOutboxStore(() => r.client, report);
    expect(await store.cas('j', { tellV: null, execV: 4 }, { _tell: { v: 1 } })).toBe(true);
    expect(r.calls).toEqual([
      ['from', 'generation_jobs'],
      ['update', { params: { _tell: { v: 1 } } }],
      ['eq', 'id', 'j'],
      ['in', 'status', ['completed', 'failed']],
      ['is', 'params->_tell', null],
      ['eq', 'params->_exec->>v', '4'],
      ['select', 'id'],
    ]);
  });

  it('a later write: the _tell version it read; a row with no lease state must still have none', async () => {
    const r = recorder({ data: [], error: null });
    const store = supabaseOutboxStore(() => r.client, report);
    expect(await store.cas('j', { tellV: 3, execV: null }, {})).toBe(false); // nothing matched: someone else wrote first
    expect(r.calls).toContainEqual(['eq', 'params->_tell->>v', '3']);
    expect(r.calls).toContainEqual(['is', 'params->_exec', null]);
  });

  it('an error is "did not happen", reported, never thrown', async () => {
    const r = recorder({ data: null, error: { message: 'boom' } });
    const store = supabaseOutboxStore(() => r.client, report);
    expect(await store.cas('j', { tellV: null, execV: null }, {})).toBe(false);
    expect(report).toHaveBeenCalled();
    expect(await supabaseOutboxStore(() => { throw new Error('no client'); }, report).read('j')).toBeNull();
  });

  it('listDue asks for fresh untold rows (not run steps) and open ones, and merges them once each', async () => {
    const row = { id: 'a', user_id: 'u', status: 'completed', service_type: 'film', params: {}, error: null, updated_at: '2026-10-10T12:00:00Z' };
    const r = recorder({ data: [row], error: null });
    const store = supabaseOutboxStore(() => r.client, report);
    const due = await store.listDue(Date.parse('2026-10-10T12:10:00Z'), 50);
    expect(due.map((d) => d.id)).toEqual(['a']);
    expect(r.calls).toContainEqual(['gte', 'updated_at', '2026-10-10T11:40:00.000Z']);
    expect(r.calls).toContainEqual(['is', 'params->_parent', null]);
    expect(r.calls).toContainEqual(['not', 'params->_tell', 'is', null]);
    expect(r.calls).toContainEqual(['is', 'params->_tell->done', null]);
  });

  it('outboxRowOf reads a row and refuses one with no id or owner', () => {
    expect(outboxRowOf({ id: 'a', user_id: 'u', status: 'failed', service_type: 'music', params: { x: 1 }, error: 'e', updated_at: '2026-10-10T12:00:00Z' }))
      .toEqual({ id: 'a', userId: 'u', status: 'failed', serviceType: 'music', params: { x: 1 }, error: 'e', updatedAt: Date.parse('2026-10-10T12:00:00Z') });
    expect(outboxRowOf({ id: 'a', status: 'failed' })).toBeNull();
  });
});
