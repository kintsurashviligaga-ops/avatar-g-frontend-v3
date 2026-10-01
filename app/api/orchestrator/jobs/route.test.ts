/** @jest-environment node */
// The progress route must never let a user forge or revive the billing state the stale-render drainer refunds from.

jest.mock('server-only', () => ({}));

type Call = { table: string; op: string; payload?: unknown; opts?: unknown; filters: Array<[string, ...unknown[]]> };
const calls: Call[] = [];
function builder(table: string) {
  const call: Call = { table, op: '', filters: [] };
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (...a: unknown[]) => { call.filters.push([name, ...a]); return b; };
  for (const f of ['eq', 'in', 'is']) b[f] = chain(f);
  b.upsert = (payload: unknown, opts: unknown) => { call.op = 'upsert'; call.payload = payload; call.opts = opts; calls.push(call); return Promise.resolve({ error: null }); };
  b.update = (payload: unknown) => { call.op = 'update'; call.payload = payload; calls.push(call); return b; };
  b.then = (res: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(res);
  return b;
}
const mockUser = { id: '11111111-1111-4111-8111-111111111111' };
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: { from: () => { throw new Error('the user session client must not write'); } }, user: mockUser })),
  createServiceRoleClient: () => ({ from: (t: string) => builder(t) }),
}));
jest.mock('../../../../lib/jobs/durableJobs', () => ({ serviceTypeForKind: () => 'image' }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ JOB_COLUMNS: 'id' }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const post = (body: Record<string, unknown>) =>
  POST(new NextRequest('https://myavatar.ge/api/orchestrator/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => { calls.length = 0; });

describe('POST /api/orchestrator/jobs — a progress note, never a billing record', () => {
  it("create strips every server-bookkeeping key (`_reserve`) from the client's params, and never overwrites", async () => {
    await post({ op: 'create', id: 'job-1', kind: 'image', params: { prompt: 'cat', _reserve: { ref: 'image:delivered-job', credits: 20 }, _x: 1 } });
    const c = calls.find((x) => x.op === 'upsert')!;
    expect((c.payload as { params: Record<string, unknown> }).params).toEqual({ prompt: 'cat' });
    expect((c.payload as { user_id: string }).user_id).toBe(mockUser.id);
    expect(c.opts).toMatchObject({ onConflict: 'id', ignoreDuplicates: true });
  });

  it.each(['update', 'complete', 'fail', 'position'])("'%s' is scoped to the caller's own still-running rows", async (op) => {
    await post({ op, id: 'job-1', stage: 'Rendering', pct: 40, url: 'https://x/y.png', position: 2 });
    const c = calls.find((x) => x.op === 'update')!;
    expect(c.filters).toEqual(expect.arrayContaining([
      ['eq', 'id', 'job-1'],
      ['eq', 'user_id', mockUser.id],
      ['in', 'status', ['pending', 'processing']],
    ]));
  });

  it.each(['update', 'complete', 'fail'])("'%s' never touches a row the server billed (it carries _reserve)", async (op) => {
    await post({ op, id: 'job-1' });
    const c = calls.find((x) => x.op === 'update')!;
    expect(c.filters).toEqual(expect.arrayContaining([['is', 'params->_reserve', null]]));
  });

  it('never writes through the user session client (the RLS owner write policies are gone)', async () => {
    const res = await post({ op: 'update', id: 'job-1' });
    expect((await res.json()).ok).toBe(true);
  });
});
