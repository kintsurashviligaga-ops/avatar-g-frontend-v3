/**
 * lib/agent/taskGraphStore.ts — the task graph (./taskGraph) kept in the user's workspace as tasks/<id>.json. Every
 * change is a new version of that file, so the graph's history is the workspace history.
 *
 * `taskStep` is how a run takes part: it STARTS its node before anything runs (refused when the node is not ready, so
 * the order the user approved is the order things happen) and returns `end`, which records done or failed with the
 * files written. Recording the end is fail-soft: the result is already the user's; the graph just says so.
 */
import { randomBytes } from 'node:crypto';
import type { WorkspaceStore } from './workspace/store';
import {
  applyTaskEvent, graphPathOf, isGraphId, parseGraph, planGraph, readyNodes, type TaskEvent, type TaskGraph, type TaskKind,
} from './taskGraph';

export interface TaskRef { graph: string; node: string }

export const taskRefOf = (v: unknown): TaskRef | null => {
  const r = (v ?? null) as { graph?: unknown; node?: unknown } | null;
  return r && isGraphId(r.graph) && typeof r.node === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(r.node) ? { graph: r.graph, node: r.node } : null;
};

export const newGraphId = () => `tg_${randomBytes(8).toString('hex')}`;

type R<T> = ({ ok: true } & T) | { ok: false; error: string };

export async function readGraph(store: WorkspaceStore, uid: string, ws: string, id: string): Promise<R<{ graph: TaskGraph }>> {
  if (!isGraphId(id)) return { ok: false, error: 'graph id' };
  const r = await store.read(uid, ws, graphPathOf(id));
  if (!r.ok) return { ok: false, error: r.error === 'not_found' ? `no task graph ${id}` : r.message };
  const g = parseGraph(r.bytes.toString('utf8'));
  return g ? { ok: true, graph: g } : { ok: false, error: `task graph ${id} is not readable` };
}

async function save(store: WorkspaceStore, uid: string, ws: string, g: TaskGraph, by: string): Promise<R<object>> {
  const w = await store.write(uid, ws, graphPathOf(g.id), Buffer.from(JSON.stringify(g, null, 2), 'utf8'), by);
  return w.ok ? { ok: true } : { ok: false, error: w.message };
}

export async function createGraph(store: WorkspaceStore, uid: string, ws: string, plan: unknown, now: Date, id = newGraphId()): Promise<R<{ graph: TaskGraph }>> {
  const p = planGraph(plan, id, now);
  if (!p.ok) return p;
  const s = await save(store, uid, ws, p.graph, 'agent');
  return s.ok ? { ok: true, graph: p.graph } : s;
}

export async function recordTaskEvent(store: WorkspaceStore, uid: string, ws: string, graphId: string, e: TaskEvent, now: Date, by: string): Promise<R<{ graph: TaskGraph }>> {
  const g = await readGraph(store, uid, ws, graphId);
  if (!g.ok) return g;
  const next = applyTaskEvent(g.graph, e, now);
  if (!next.ok) return next;
  const s = await save(store, uid, ws, next.graph, by);
  return s.ok ? next : s;
}

/** Whether the node can start now as this kind: checked BEFORE a quote is used up, so a wrong order burns nothing. */
export async function checkTaskReady(store: WorkspaceStore, uid: string, ws: string, ref: TaskRef, kind: TaskKind): Promise<R<object>> {
  const g = await readGraph(store, uid, ws, ref.graph);
  if (!g.ok) return g;
  const n = g.graph.nodes.find((x) => x.id === ref.node);
  if (!n) return { ok: false, error: `no step "${ref.node}"` };
  if (n.kind !== kind) return { ok: false, error: `step "${n.id}" is a ${n.kind} step, not ${kind}` };
  if (!readyNodes(g.graph).some((x) => x.id === n.id)) {
    return { ok: false, error: n.status === 'planned' ? `step "${n.id}" needs ${n.needs.join(', ')} first` : `step "${n.id}" is ${n.status}` };
  }
  return { ok: true };
}

/**
 * Start a node for a run, or say why not. On success `end` records how it ended (fail-soft: never throws, and a graph
 * that cannot be written does not take the run's result away).
 */
export async function taskStep(
  store: WorkspaceStore, uid: string, ws: string, ref: TaskRef,
  run: { kind: TaskKind; id: string; inputs?: string[]; now: () => Date },
): Promise<R<{ end(outcome: { ok: true; outputs: string[] } | { ok: false; error: string }): Promise<void> }>> {
  const by = `${run.kind}:${run.id}`;
  const started = await recordTaskEvent(store, uid, ws, ref.graph, { type: 'start', node: ref.node, kind: run.kind, run: run.id, inputs: run.inputs }, run.now(), by);
  if (!started.ok) return started;
  return {
    ok: true,
    async end(outcome) {
      const e: TaskEvent = outcome.ok
        ? { type: 'done', node: ref.node, run: run.id, outputs: outcome.outputs }
        : { type: 'failed', node: ref.node, run: run.id, error: outcome.error };
      await recordTaskEvent(store, uid, ws, ref.graph, e, run.now(), by).catch(() => undefined);
    },
  };
}
