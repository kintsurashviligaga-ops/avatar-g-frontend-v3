/** @jest-environment node */
import { applyTaskEvent, graphSummary, parseGraph, planGraph, readyNodes, workModeTemplate, MAX_TASK_NODES, type TaskGraph } from './taskGraph';

const NOW = new Date('2026-11-06T18:00:00Z');
const ID = 'tg_abcdef123456';

function graph(): TaskGraph {
  const p = planGraph(workModeTemplate('ლარის კურსი'), ID, NOW);
  if (!p.ok) throw new Error(p.error);
  return p.graph;
}

describe('task graph', () => {
  it('plans the work-mode chain, every node planned, only the first ready', () => {
    const g = graph();
    expect(g.nodes.map((n) => [n.id, n.kind, n.status])).toEqual([
      ['research', 'browser', 'planned'], ['analyse', 'code', 'planned'], ['pdf', 'pdf', 'planned'], ['library', 'export', 'planned'],
    ]);
    expect(readyNodes(g).map((n) => n.id)).toEqual(['research']);
  });

  it('refuses a node that needs a later or unknown one, a duplicate id, a bad kind, too many nodes', () => {
    const base = { title: 't' };
    expect(planGraph({ ...base, nodes: [{ id: 'a', kind: 'code', title: 'a', needs: ['b'] }, { id: 'b', kind: 'code', title: 'b' }] }, ID, NOW)).toMatchObject({ ok: false });
    expect(planGraph({ ...base, nodes: [{ id: 'a', kind: 'code', title: 'a', needs: ['a'] }] }, ID, NOW)).toMatchObject({ ok: false });
    expect(planGraph({ ...base, nodes: [{ id: 'a', kind: 'code', title: 'a' }, { id: 'a', kind: 'pdf', title: 'b' }] }, ID, NOW)).toMatchObject({ ok: false });
    expect(planGraph({ ...base, nodes: [{ id: 'a', kind: 'shell', title: 'a' }] }, ID, NOW)).toMatchObject({ ok: false });
    expect(planGraph({ ...base, nodes: Array.from({ length: MAX_TASK_NODES + 1 }, (_, i) => ({ id: `n${i}`, kind: 'code', title: 'x' })) }, ID, NOW)).toMatchObject({ ok: false });
    expect(planGraph({ ...base, nodes: [{ id: 'a', kind: 'code', title: 'a' }] }, 'tg_../x', NOW)).toMatchObject({ ok: false });
  });

  it('starts a node only when ready and as its kind; ends it only by the run that started it', () => {
    let g = graph();
    expect(applyTaskEvent(g, { type: 'start', node: 'analyse', kind: 'code', run: 'r1' }, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('research') });
    expect(applyTaskEvent(g, { type: 'start', node: 'research', kind: 'code', run: 'r1' }, NOW)).toMatchObject({ ok: false, error: expect.stringContaining('browser') });
    const s = applyTaskEvent(g, { type: 'start', node: 'research', kind: 'browser', run: 'r1' }, NOW);
    if (!s.ok) throw new Error(s.error);
    g = s.graph;
    expect(g.nodes[0]).toMatchObject({ status: 'running', run: 'r1' });
    expect(applyTaskEvent(g, { type: 'done', node: 'research', run: 'other', outputs: [] }, NOW)).toMatchObject({ ok: false });
    expect(applyTaskEvent(g, { type: 'start', node: 'research', kind: 'browser', run: 'r2' }, NOW)).toMatchObject({ ok: false });
    const d = applyTaskEvent(g, { type: 'done', node: 'research', run: 'r1', outputs: ['browser/x/text-1.txt'] }, NOW);
    if (!d.ok) throw new Error(d.error);
    g = d.graph;
    expect(readyNodes(g).map((n) => n.id)).toEqual(['analyse']);
    // A done node never moves again.
    expect(applyTaskEvent(g, { type: 'failed', node: 'research', run: 'r1', error: 'x' }, NOW)).toMatchObject({ ok: false });
    expect(graphSummary(g)).toContain('✓ research [browser]');
    expect(graphSummary(g)).toContain('→ browser/x/text-1.txt');
  });

  it('a failed node blocks what needs it', () => {
    let g = graph();
    for (const e of [{ type: 'start', node: 'research', kind: 'browser', run: 'r' }, { type: 'failed', node: 'research', run: 'r', error: 'timeout' }] as const) {
      const r = applyTaskEvent(g, e, NOW);
      if (!r.ok) throw new Error(r.error);
      g = r.graph;
    }
    expect(readyNodes(g)).toEqual([]);
    expect(graphSummary(g)).toContain('✗ research [browser]');
  });

  it('reads a stored graph back only when its shape holds', () => {
    const g = graph();
    expect(parseGraph(JSON.stringify(g))).toMatchObject({ id: ID });
    expect(parseGraph('{')).toBeNull();
    expect(parseGraph(JSON.stringify({ ...g, nodes: [{ ...g.nodes[1] }] }))).toBeNull(); // needs a node that is not before it
    expect(parseGraph(JSON.stringify({ ...g, nodes: [{ ...g.nodes[0], status: 'hacked' }] }))).toBeNull();
  });
});
