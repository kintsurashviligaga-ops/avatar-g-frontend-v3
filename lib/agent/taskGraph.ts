/**
 * lib/agent/taskGraph.ts — ONE shared task graph for Agent G's work-mode tasks (GG's audit ACTION 3): research in the
 * browser, a program over the results, a PDF, the Library. Pure; its store is the user's workspace (no migration).
 *
 * A graph is a short list of NODES. Each node is one step of a kind the platform already runs as a user-confirmed
 * action, and names the earlier nodes it needs:
 *
 *   browser   a browser task (lib/agent/browser)          → screenshots and texts under browser/<task>/
 *   code      a workspace program (lib/agent/sandbox)      → the files it writes (CSV, chart, report.json)
 *   pdf       a Georgian PDF from a workspace JSON spec    → <name>.pdf (lib/documents, FiraGO fonts)
 *   export    a workspace file filed in the Library
 *
 * A node may only name EARLIER nodes, so a graph is acyclic by construction and the order the user saw is an order it
 * can run in. Every tool that runs a node records it here (start → done | failed, with the files it read and wrote and
 * the run's id), so the graph is the one place that says what happened, by whom, from which inputs: the evidence trail
 * GG's "PROVEN only with a real user action" asks for. A node starts only when every node it needs is done; a done or
 * failed node never moves again (a retry is a new node that names the same inputs).
 *
 * Stored as `tasks/<graph id>.json` in the user's Agent G workspace: every change is a new version, so the history of
 * the graph is the workspace history of that file.
 */

export const TASK_KINDS = ['browser', 'code', 'pdf', 'export'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export type TaskStatus = 'planned' | 'running' | 'done' | 'failed';

export const MAX_TASK_NODES = 12;
const NODE_ID = /^[a-z][a-z0-9-]{0,23}$/;
const GRAPH_ID = /^tg_[a-z0-9]{6,32}$/;
const MAX_PATHS = 30;

export interface TaskNode {
  id: string;
  kind: TaskKind;
  title: string;
  needs: string[];
  status: TaskStatus;
  /** Workspace paths the step read. */
  inputs: string[];
  /** Workspace paths the step wrote (or the Library id, for an export). */
  outputs: string[];
  /** The run that carried it (a quote's job id), for the trail. */
  run?: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

export interface TaskGraph {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodes: TaskNode[];
}

export type GraphCheck<T> = ({ ok: true } & T) | { ok: false; error: string };

export const isGraphId = (v: unknown): v is string => typeof v === 'string' && GRAPH_ID.test(v);
export const graphPathOf = (id: string) => `tasks/${id}.json`;

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return s && s.length <= max ? s : null;
};

/** A plan the agent proposes → a graph, every node `planned`. */
export function planGraph(input: unknown, id: string, now: Date): GraphCheck<{ graph: TaskGraph }> {
  if (!isGraphId(id)) return { ok: false, error: 'graph id' };
  const r = (input ?? {}) as { title?: unknown; nodes?: unknown };
  const title = clean(r.title, 160);
  if (!title) return { ok: false, error: 'title (≤ 160 characters)' };
  if (!Array.isArray(r.nodes) || r.nodes.length === 0) return { ok: false, error: 'nodes: a non-empty list' };
  if (r.nodes.length > MAX_TASK_NODES) return { ok: false, error: `nodes: at most ${MAX_TASK_NODES}` };
  const seen = new Set<string>();
  const nodes: TaskNode[] = [];
  for (const [i, raw] of r.nodes.entries()) {
    const n = (raw ?? {}) as Record<string, unknown>;
    const at = `node ${i + 1}`;
    if (typeof n.id !== 'string' || !NODE_ID.test(n.id)) return { ok: false, error: `${at}: id (a-z, 0-9, -)` };
    if (seen.has(n.id)) return { ok: false, error: `${at}: id "${n.id}" twice` };
    if (!TASK_KINDS.includes(n.kind as TaskKind)) return { ok: false, error: `${at}: kind must be ${TASK_KINDS.join(', ')}` };
    const t = clean(n.title, 200);
    if (!t) return { ok: false, error: `${at}: title` };
    const needs = n.needs === undefined ? [] : n.needs;
    if (!Array.isArray(needs) || needs.some((x) => typeof x !== 'string' || !seen.has(x))) {
      return { ok: false, error: `${at}: needs may only name earlier nodes` };
    }
    seen.add(n.id);
    nodes.push({ id: n.id, kind: n.kind as TaskKind, title: t, needs: [...new Set(needs as string[])], status: 'planned', inputs: [], outputs: [] });
  }
  const at = now.toISOString();
  return { ok: true, graph: { id, title, createdAt: at, updatedAt: at, nodes } };
}

/** Nodes that may start now: planned, and everything they need is done. */
export function readyNodes(g: TaskGraph): TaskNode[] {
  const done = new Set(g.nodes.filter((n) => n.status === 'done').map((n) => n.id));
  return g.nodes.filter((n) => n.status === 'planned' && n.needs.every((x) => done.has(x)));
}

export type TaskEvent =
  | { type: 'start'; node: string; kind: TaskKind; run: string; inputs?: string[] }
  | { type: 'done'; node: string; run: string; outputs: string[] }
  | { type: 'failed'; node: string; run: string; error: string };

const paths = (v: string[] | undefined) => (v ?? []).filter((p) => typeof p === 'string' && p.length <= 300).slice(0, MAX_PATHS);

/**
 * One event → the next graph, or why it may not happen. A node starts only once its needs are done and only as the kind
 * it was planned as; it ends only from running, by the run that started it.
 */
export function applyTaskEvent(g: TaskGraph, e: TaskEvent, now: Date): GraphCheck<{ graph: TaskGraph }> {
  const i = g.nodes.findIndex((n) => n.id === e.node);
  if (i < 0) return { ok: false, error: `no node "${e.node}"` };
  const n = g.nodes[i]!;
  const at = now.toISOString();
  let next: TaskNode;
  if (e.type === 'start') {
    if (n.status !== 'planned') return { ok: false, error: `node "${n.id}" is ${n.status}` };
    if (n.kind !== e.kind) return { ok: false, error: `node "${n.id}" is a ${n.kind} step, not ${e.kind}` };
    if (!readyNodes(g).some((r) => r.id === n.id)) return { ok: false, error: `node "${n.id}" needs ${n.needs.join(', ')} first` };
    next = { ...n, status: 'running', run: e.run, inputs: paths(e.inputs), startedAt: at };
  } else {
    if (n.status !== 'running' || n.run !== e.run) return { ok: false, error: `node "${n.id}" is not running this step` };
    next = e.type === 'done'
      ? { ...n, status: 'done', outputs: paths(e.outputs), endedAt: at }
      : { ...n, status: 'failed', error: e.error.slice(0, 300), endedAt: at };
  }
  const nodes = g.nodes.slice();
  nodes[i] = next;
  return { ok: true, graph: { ...g, nodes, updatedAt: at } };
}

/** A stored graph read back: shape-checked, never trusted blindly (the file is in a folder the user can edit). */
export function parseGraph(text: string): TaskGraph | null {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  const g = v as Partial<TaskGraph>;
  if (!g || !isGraphId(g.id) || typeof g.title !== 'string' || !Array.isArray(g.nodes) || g.nodes.length > MAX_TASK_NODES) return null;
  const ids = new Set<string>();
  for (const n of g.nodes) {
    if (!n || typeof n.id !== 'string' || !NODE_ID.test(n.id) || !TASK_KINDS.includes(n.kind) || !Array.isArray(n.needs)) return null;
    if (n.needs.some((x) => !ids.has(x))) return null;
    if (!['planned', 'running', 'done', 'failed'].includes(n.status)) return null;
    if (!Array.isArray(n.inputs) || !Array.isArray(n.outputs)) return null;
    ids.add(n.id);
  }
  return g as TaskGraph;
}

/** What the agent and the card read: one line per node. */
export function graphSummary(g: TaskGraph): string {
  const mark: Record<TaskStatus, string> = { planned: '○', running: '✱', done: '✓', failed: '✗' };
  return [`${g.title} (${g.id})`, ...g.nodes.map((n) =>
    `${mark[n.status]} ${n.id} [${n.kind}] ${n.title}${n.needs.length ? ` ← ${n.needs.join(', ')}` : ''}` +
    `${n.outputs.length ? ` → ${n.outputs.join(', ')}` : ''}${n.error ? ` (${n.error})` : ''}`)].join('\n');
}

/** The work-mode example GG named: Research → CSV → Python → Chart → Georgian PDF → Library. */
export function workModeTemplate(topic: string): { title: string; nodes: Array<{ id: string; kind: TaskKind; title: string; needs?: string[] }> } {
  return {
    title: topic,
    nodes: [
      { id: 'research', kind: 'browser', title: 'Read the source pages and keep their text and a screenshot' },
      { id: 'analyse', kind: 'code', title: 'Turn the text into data.csv, compute, draw chart.svg, write report.json', needs: ['research'] },
      { id: 'pdf', kind: 'pdf', title: 'Render report.json as a Georgian PDF', needs: ['analyse'] },
      { id: 'library', kind: 'export', title: 'File the PDF in the Library', needs: ['pdf'] },
    ],
  };
}
