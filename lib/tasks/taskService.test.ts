/** @jest-environment node */
/**
 * The task API's rules with an in-memory store: only the owner's rows, a lease job read through its executor (and handed
 * to a worker only while workers are open to the caller), the list newest first and capped, and Stop only where a
 * server-side stop exists.
 */
import { cancelTask, listTasks, MAX_LIST, readTask, type TaskDeps, type TaskKind } from './taskService';
import { taskFromRow, type TaskRow, type TaskView } from './taskView';

const row = (id: string, r: Partial<TaskRow> = {}): TaskRow => ({
  id, user_id: 'user-1', service_type: 'film', status: 'processing', current_stage: null, pct: null, params: {}, result: null,
  signed_url: null, error: null, created_at: null, updated_at: null, ...r,
});
const lease = (kind: string) => ({ _exec: { kind } });

function harness(rows: TaskRow[]) {
  const live: TaskView = { ...taskFromRow(row('x')), kind: 'agent-montage', status: 'running', cancellable: true, attempt: 1 };
  const k = {
    status: jest.fn(async (r: TaskRow, _userId: string) => ({ task: { ...live, id: r.id }, needsWorker: r.current_stage === 'orphan' })),
    view: jest.fn((r: TaskRow) => (r.status === 'completed' ? { ...live, id: r.id, status: 'completed' as const, cancellable: false } : { ...live, id: r.id })),
    cancel: jest.fn(async (_userId: string, id: string) => {
      const r = rows.find((x) => x.id === id)!;
      if (r.status !== 'processing') return 'not_running' as const;
      r.status = 'failed';
      r.error = 'cancelled';
      return 'ok' as const;
    }),
    startWorker: jest.fn(),
  } satisfies TaskKind;
  const listed: Array<{ active: boolean; limit: number }> = [];
  const deps: TaskDeps = {
    readRow: async (userId, id) => rows.find((r) => r.id === id && r.user_id === userId) ?? null,
    listRows: async (userId, opts) => {
      listed.push(opts);
      return rows.filter((r) => r.user_id === userId && (!opts.active || r.status === 'pending' || r.status === 'processing')).slice(0, opts.limit);
    },
    kindOf: (r) => ((r.params?._exec as { kind?: string } | undefined)?.kind ?? null),
    kinds: { 'agent-montage': k },
    plain: taskFromRow,
  };
  return { deps, k, listed };
}

describe('read', () => {
  test("another user's task, or none, is null (never forbidden): the same answer for both", async () => {
    const { deps } = harness([row('a', { user_id: 'user-2' })]);
    expect(await readTask(deps, { userId: 'user-1', id: 'a', workersOpen: true })).toBeNull();
    expect(await readTask(deps, { userId: 'user-1', id: 'missing', workersOpen: true })).toBeNull();
  });

  test('a studio render is its row; a lease job is its executor view', async () => {
    const { deps, k } = harness([row('r', { status: 'completed', signed_url: 'https://s/v.mp4' }), row('m', { params: lease('agent-montage') })]);
    expect(await readTask(deps, { userId: 'user-1', id: 'r', workersOpen: true })).toMatchObject({ kind: 'render', status: 'completed', result: { url: 'https://s/v.mp4' } });
    expect(await readTask(deps, { userId: 'user-1', id: 'm', workersOpen: true })).toMatchObject({ id: 'm', kind: 'agent-montage', status: 'running' });
    expect(k.status).toHaveBeenCalledWith(expect.objectContaining({ id: 'm' }), 'user-1', { workersOpen: true });
  });

  test('a lease job no worker holds gets one only while workers are open to the caller', async () => {
    const { deps, k } = harness([row('m', { params: lease('agent-montage'), current_stage: 'orphan' }), row('n', { params: lease('agent-montage') })]);
    await readTask(deps, { userId: 'user-1', id: 'm', workersOpen: false });
    expect(k.startWorker).not.toHaveBeenCalled();
    await readTask(deps, { userId: 'user-1', id: 'n', workersOpen: true });
    expect(k.startWorker).not.toHaveBeenCalled();
    await readTask(deps, { userId: 'user-1', id: 'm', workersOpen: true });
    expect(k.startWorker).toHaveBeenCalledWith('m');
  });

  test('an unknown lease kind reads as a plain row; an executor that disowns the row is null', async () => {
    const { deps, k } = harness([row('u', { params: lease('something-else') }), row('m', { params: lease('agent-montage') })]);
    expect(await readTask(deps, { userId: 'user-1', id: 'u', workersOpen: true })).toMatchObject({ kind: 'render', status: 'running' });
    k.status.mockResolvedValueOnce(null as never);
    expect(await readTask(deps, { userId: 'user-1', id: 'm', workersOpen: true })).toBeNull();
  });
});

describe('list', () => {
  test("the caller's own tasks only, in the store's order, never more than the cap", async () => {
    const { deps, listed } = harness([row('a'), row('b', { user_id: 'user-2' }), row('c', { params: lease('agent-montage') })]);
    expect((await listTasks(deps, { userId: 'user-1', active: false, limit: 5 })).map((t) => [t.id, t.kind])).toEqual([['a', 'render'], ['c', 'agent-montage']]);
    await listTasks(deps, { userId: 'user-1', active: false, limit: 500 });
    await listTasks(deps, { userId: 'user-1', active: false, limit: 0 });
    await listTasks(deps, { userId: 'user-1', active: false, limit: Number.NaN });
    expect(listed.map((o) => o.limit)).toEqual([5, MAX_LIST, 1, 1]);
  });

  test('active: live tasks only, even when the store returns a row that has just ended', async () => {
    const { deps } = harness([row('a'), row('d', { status: 'completed' }), row('c', { params: lease('agent-montage'), status: 'processing' })]);
    deps.listRows = async () => [row('a'), row('d', { status: 'completed' }), row('e', { status: 'completed', params: lease('agent-montage') })];
    expect((await listTasks(deps, { userId: 'user-1', active: true, limit: 20 })).map((t) => t.id)).toEqual(['a']);
  });
});

describe('cancel', () => {
  test("none, or someone else's: not_found", async () => {
    const { deps } = harness([row('a', { user_id: 'user-2', params: lease('agent-montage') })]);
    expect(await cancelTask(deps, { userId: 'user-1', id: 'a' })).toEqual({ ok: false, error: 'not_found' });
  });

  test('a studio render has no server-side stop: not_cancellable while it runs, not_running once over', async () => {
    const { deps } = harness([row('r'), row('d', { status: 'completed' })]);
    expect(await cancelTask(deps, { userId: 'user-1', id: 'r' })).toEqual({ ok: false, error: 'not_cancellable' });
    expect(await cancelTask(deps, { userId: 'user-1', id: 'd' })).toEqual({ ok: false, error: 'not_running' });
  });

  test("a lease job is stopped through its executor, with the caller's id, and answered with its fresh view", async () => {
    const rows = [row('m', { params: lease('agent-montage') })];
    const { deps, k } = harness(rows);
    const r = await cancelTask(deps, { userId: 'user-1', id: 'm' });
    expect(k.cancel).toHaveBeenCalledWith('user-1', 'm');
    expect(r).toMatchObject({ ok: true, task: { id: 'm' } });
    expect(rows[0]!.status).toBe('failed');
    expect(await cancelTask(deps, { userId: 'user-1', id: 'm' })).toEqual({ ok: false, error: 'not_running' });
  });
});
