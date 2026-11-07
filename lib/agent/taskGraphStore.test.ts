/** @jest-environment node */
import { memoryBlobs, workspaceStore } from './workspace/store';
import { workModeTemplate } from './taskGraph';
import { checkTaskReady, createGraph, readGraph, taskRefOf, taskStep } from './taskGraphStore';

const U = '11111111-2222-3333-4444-555555555555';
const NOW = () => new Date('2026-11-06T18:00:00Z');

async function setup() {
  const store = workspaceStore(memoryBlobs());
  const w = await store.ensure(U, 'Agent G');
  if (!w.ok) throw new Error(w.message);
  const g = await createGraph(store, U, w.workspace.id, workModeTemplate('კურსი'), NOW(), 'tg_test1234');
  if (!g.ok) throw new Error(g.error);
  return { store, ws: w.workspace.id };
}

describe('task graph store', () => {
  it('saves the graph as tasks/<id>.json and every change is a new version', async () => {
    const { store, ws } = await setup();
    const st = await taskStep(store, U, ws, { graph: 'tg_test1234', node: 'research' }, { kind: 'browser', id: 'job1', now: NOW });
    if (!st.ok) throw new Error(st.error);
    await st.end({ ok: true, outputs: ['browser/job1/text-1.txt'] });
    const h = await store.history(U, ws, 'tasks/tg_test1234.json');
    expect(h.ok && h.versions.length).toBe(3);
    const g = await readGraph(store, U, ws, 'tg_test1234');
    expect(g.ok && g.graph.nodes[0]).toMatchObject({ status: 'done', run: 'job1', outputs: ['browser/job1/text-1.txt'] });
  });

  it('says whether a step may start before anything is used up', async () => {
    const { store, ws } = await setup();
    expect(await checkTaskReady(store, U, ws, { graph: 'tg_test1234', node: 'research' }, 'browser')).toEqual({ ok: true });
    expect(await checkTaskReady(store, U, ws, { graph: 'tg_test1234', node: 'analyse' }, 'code')).toMatchObject({ ok: false, error: expect.stringContaining('research') });
    expect(await checkTaskReady(store, U, ws, { graph: 'tg_test1234', node: 'research' }, 'code')).toMatchObject({ ok: false });
    expect(await checkTaskReady(store, U, ws, { graph: 'tg_test1234', node: 'nope' }, 'code')).toMatchObject({ ok: false });
    expect(await checkTaskReady(store, U, ws, { graph: 'tg_missing99', node: 'research' }, 'browser')).toMatchObject({ ok: false, error: expect.stringContaining('no task graph') });
  });

  it('refuses a second start and never throws from end', async () => {
    const { store, ws } = await setup();
    const ref = { graph: 'tg_test1234', node: 'research' };
    const a = await taskStep(store, U, ws, ref, { kind: 'browser', id: 'a', now: NOW });
    expect(a.ok).toBe(true);
    expect(await taskStep(store, U, ws, ref, { kind: 'browser', id: 'b', now: NOW })).toMatchObject({ ok: false, error: expect.stringContaining('running') });
    if (!a.ok) return;
    await a.end({ ok: false, error: 'timeout' });
    await expect(a.end({ ok: true, outputs: [] })).resolves.toBeUndefined();
    const g = await readGraph(store, U, ws, 'tg_test1234');
    expect(g.ok && g.graph.nodes[0]?.status).toBe('failed');
  });

  it('reads only well-formed step references', () => {
    expect(taskRefOf({ graph: 'tg_test1234', node: 'pdf' })).toEqual({ graph: 'tg_test1234', node: 'pdf' });
    for (const bad of [null, {}, { graph: '../x', node: 'a' }, { graph: 'tg_test1234', node: 'A B' }, 'tg_test1234']) expect(taskRefOf(bad)).toBeNull();
  });
});
