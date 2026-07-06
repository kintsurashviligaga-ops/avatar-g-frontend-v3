/** @jest-environment node */
jest.mock('server-only', () => ({}));

import { listJobs, cancelJob, retryJob } from './jobs';

/**
 * Chainable Supabase mock. Terminal awaited calls resolve via `then`. cancel/retry chain
 * .update().eq().in()/.eq().select() → the final .select() is the awaited result.
 */
function makeClient(cfg: { active?: unknown[]; failed?: unknown[]; updateData?: unknown[]; updateError?: { message: string } | null }) {
  let selectCount = 0;
  const from = () => {
    const p: Record<string, unknown> = {
      select: () => { selectCount += 1; return p; },
      in: () => p,
      eq: () => p,
      order: () => p,
      update: () => p,
      // list: two selects (active, failed) awaited via limit(); update path awaits the trailing select().
      limit: () => Promise.resolve({ data: selectCount === 1 ? (cfg.active ?? []) : (cfg.failed ?? []), error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: cfg.updateData ?? [], error: cfg.updateError ?? null }).then(resolve),
    };
    return p;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any;
}

describe('listJobs', () => {
  it('maps active + recentFailed rows', async () => {
    const client = makeClient({
      active: [{ id: 'j1', user_id: 'u1', service_type: 'film', status: 'processing', current_stage: 'clips', pct: 40, error: null, created_at: '2026-07-06', updated_at: '2026-07-06' }],
      failed: [{ id: 'j2', service_type: 'image', status: 'failed', error: 'boom', created_at: '2026-07-05' }],
    });
    const r = await listJobs(client);
    expect(r.active[0]).toMatchObject({ id: 'j1', service_type: 'film', status: 'processing', pct: 40 });
    expect(r.recentFailed[0]).toMatchObject({ id: 'j2', status: 'failed', error: 'boom', pct: 0, user_id: null });
  });

  it('fails open to empty lists on error', async () => {
    const throwing = { from: () => { throw new Error('down'); } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await listJobs(throwing as any)).toEqual({ active: [], recentFailed: [] });
  });
});

describe('cancelJob', () => {
  it('rejects an empty id', async () => {
    expect(await cancelJob(makeClient({}), '')).toEqual({ ok: false, changed: false, error: 'invalid_id' });
  });
  it('reports changed=true when a non-terminal row was updated', async () => {
    expect(await cancelJob(makeClient({ updateData: [{ id: 'j1' }] }), 'j1')).toEqual({ ok: true, changed: true });
  });
  it('reports changed=false when the row was already terminal (no-op)', async () => {
    expect(await cancelJob(makeClient({ updateData: [] }), 'j1')).toEqual({ ok: true, changed: false });
  });
  it('surfaces an update error', async () => {
    expect((await cancelJob(makeClient({ updateError: { message: 'x' } }), 'j1')).error).toBe('x');
  });
});

describe('retryJob', () => {
  it('rejects an empty id', async () => {
    expect(await retryJob(makeClient({}), '')).toEqual({ ok: false, changed: false, error: 'invalid_id' });
  });
  it('reports changed=true when a failed row was reset', async () => {
    expect(await retryJob(makeClient({ updateData: [{ id: 'j2' }] }), 'j2')).toEqual({ ok: true, changed: true });
  });
  it('reports changed=false when the row was not failed', async () => {
    expect(await retryJob(makeClient({ updateData: [] }), 'j2')).toEqual({ ok: true, changed: false });
  });
});
