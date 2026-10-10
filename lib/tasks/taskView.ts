/**
 * lib/tasks/taskView.ts — ONE shape for a task, whoever started it and however it is stored (Agent G execution
 * foundation, EF-7; owner, 2026-10-09 11:15Z: "one Task API for text, voice and media").
 *
 * A task is work that outlives the request that asked for it. In this app every such task is a generation_jobs row:
 * a studio render (the job tray's rows), an Agent G montage or an audio extraction (lease-queue rows,
 * lib/orchestrator/jobLease). The text chat, a Live voice call and Agent G's own loop do not keep tasks of their own:
 * they START these jobs and then follow them. So a TaskView is built from a job row, and every surface reads the same
 * view through one route (app/api/tasks): the chat cards, the voice call's stop, and anything after them.
 *
 * Pure and isomorphic (the chat imports the types). The executors' own owner views (montageExec `viewOf`,
 * audioExtract `audioViewOf`) stay the source of what a lease job means; this file only puts them in one shape.
 */
import type { JobView } from '@/lib/agent/media/montageExec';
import type { AudioJobView, AudioRights } from '@/lib/agent/media/audioExtract';
import type { CapabilityId } from '@/lib/agent/contracts';
import type { ChildView, RunEvent, RunState } from '@/lib/agent/run/runEngine';
import type { RunTool } from '@/lib/agent/run/runSpec';
import { isFinalStatus, normalizeStatus, type TaskStatus } from './statusModel';

export type { TaskStatus } from './statusModel';
export type TaskMedia = 'video' | 'audio' | 'image' | 'file';

export interface TaskResult {
  url: string;
  media: TaskMedia;
  name?: string;
  durationSec?: number;
  bytes?: number;
  bitrateKbps?: number;
  aspect?: string;
  rights?: AudioRights | null;
}

export interface TaskView {
  id: string;
  /** What runs it: a lease kind ('agent-montage', 'agent-audio-extract') or 'render' for a studio job. */
  kind: string;
  /** The row's service type (film, music, image, …). */
  service: string;
  status: TaskStatus;
  stage: string | null;
  pct: number | null;
  /** The attempt a lease worker is on (1 or 2); null for a studio render. */
  attempt: number | null;
  result: TaskResult | null;
  /** Why it failed, as a code ('cancelled', 'no_audio', 'qc_failed', 'render_failed', 'failed', …). */
  error: string | null;
  /** May its owner stop it now (POST /api/tasks { action: 'cancel' })? */
  cancellable: boolean;
  /** The owner's own words for a studio render (its prompt, brief or title, cut short); null for a lease job. */
  label: string | null;
  /** 1-based place in the studio's client queue while a render waits for a slot; null otherwise. */
  position: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** The multi-step run this job is a step of (its card shows it; the tray shows the run instead). */
  parentId?: string;
  /** A multi-step run's steps, in order (kind 'agent-run' only). */
  steps?: TaskStepView[];
  /** A multi-step run's events, oldest first, each numbered (G8): what its card narrates. `GET ?id=…&after=n` sends only newer ones. */
  events?: RunEvent[];
}

/** One step of a multi-step run, as its card shows it. */
export interface TaskStepView {
  id: string;
  tool: RunTool;
  capability: CapabilityId;
  status: TaskStatus;
  /** The step's own job (a Task API id of its own), once quoted. */
  taskId: string | null;
  stage: string | null;
  pct: number | null;
  result: TaskResult | null;
  error: string | null;
  /** Delivered by the run this one resumed: reused, not run again. */
  reused: boolean;
  /** The step waits for the user's yes to this price (POST /api/tasks { action: 'approve', id, step, quoteId }). */
  approval: { credits: number; quoteId: string; expiresAt: number } | null;
}

/** A job row as the route reads it (generation_jobs, the columns in lib/orchestrator/jobs JOB_COLUMNS). */
export interface TaskRow {
  id: string;
  user_id: string;
  service_type: string;
  status: string;
  current_stage: string | null;
  pct: number | null;
  params: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  signed_url: string | null;
  error: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** The studio queue's place for a waiting render (migration 20260704; absent where the column is missing). */
  position_in_queue?: number | null;
}

/** Ids are generation_jobs keys: a UUID for Agent G, `prod_<ms>_<rand>`-style for studio renders. */
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
export function parseTaskId(x: unknown): string | null {
  return typeof x === 'string' && ID.test(x) ? x : null;
}

const MEDIA: Record<string, TaskMedia> = { film: 'video', avatar: 'video', interior: 'image', image: 'image', music: 'audio', voice: 'audio' };
const parentOf = (row: TaskRow): { parentId: string } | Record<string, never> => {
  const p = row.params?._parent;
  return typeof p === 'string' && p ? { parentId: p } : {};
};
const meta = (row: TaskRow) => ({
  id: row.id, service: row.service_type, label: null, position: null, createdAt: row.created_at, updatedAt: row.updated_at, ...parentOf(row),
});
const str = (x: unknown): string | null => (typeof x === 'string' && x ? x : null);

/** Longest label a task carries (the tray cuts it shorter). */
export const LABEL_MAX = 80;

/** A studio render's own words: its prompt, else its brief, else its title. */
function labelOf(params: Record<string, unknown> | null): string | null {
  const p = params ?? {};
  const raw = [p.prompt, p.brief, p.title].find((x) => typeof x === 'string' && x.trim());
  return typeof raw === 'string' ? raw.trim().slice(0, LABEL_MAX) : null;
}

/** A studio render (no lease): the row's own columns, its status word read through the one status model. */
export function taskFromRow(row: TaskRow): TaskView {
  const r = row.result ?? {};
  const base = { ...meta(row), kind: 'render', attempt: null, cancellable: false, label: labelOf(row.params) };
  // A word no store is known to use is still a live row (as before the status model): never reported as finished.
  const status = normalizeStatus(row.status, row.error) ?? 'running';
  if (status === 'completed' || status === 'partially_completed') {
    const url = str(row.signed_url) ?? str(r.url) ?? str(r.videoUrl) ?? str(r.audioUrl) ?? str(r.imageUrl);
    return {
      ...base, status: 'completed', stage: null, pct: 100, error: null,
      result: url ? { url, media: MEDIA[row.service_type] ?? 'file' } : null,
    };
  }
  if (status === 'failed' || status === 'cancelled') {
    return { ...base, status, stage: null, pct: null, result: null, error: status };
  }
  const waiting = status === 'queued';
  const place = typeof row.position_in_queue === 'number' && row.position_in_queue > 0 ? Math.floor(row.position_in_queue) : null;
  return {
    ...base, status: waiting ? 'queued' : 'running', position: waiting ? place : null,
    stage: row.current_stage, pct: typeof row.pct === 'number' ? row.pct : null, result: null, error: null,
  };
}

type Live = { status: 'queued' | 'running'; stage: string | null; pct: number; attempt: number };
const live = (v: Live) => ({ status: v.status, stage: v.stage, pct: v.pct, attempt: v.attempt, result: null, error: null, cancellable: true });
const ended = (code: string) => ({
  status: code === 'cancelled' ? ('cancelled' as const) : ('failed' as const),
  stage: null, pct: null, attempt: null, result: null, error: code, cancellable: false,
});

/** An Agent G montage, from the executor's own owner view. */
export function taskFromMontage(row: TaskRow, kind: string, v: JobView): TaskView {
  const base = { ...meta(row), kind };
  if (v.status === 'completed') {
    return {
      ...base, status: 'completed', stage: null, pct: 100, attempt: null, error: null, cancellable: false,
      result: v.videoUrl ? { url: v.videoUrl, media: 'video', durationSec: v.durationSec, aspect: v.aspect } : null,
    };
  }
  if (v.status === 'failed') return { ...base, ...ended(v.error) };
  return { ...base, ...live(v) };
}

/** An Agent G audio extraction, from the executor's own owner view. */
export function taskFromAudio(row: TaskRow, kind: string, v: AudioJobView): TaskView {
  const base = { ...meta(row), kind };
  if (v.status === 'completed') {
    return {
      ...base, status: 'completed', stage: null, pct: 100, attempt: null, error: null, cancellable: false,
      result: v.audioUrl
        ? { url: v.audioUrl, media: 'audio', name: v.name, durationSec: v.durationSec, bytes: v.bytes, bitrateKbps: v.bitrateKbps, rights: v.rights }
        : null,
    };
  }
  if (v.status === 'failed') return { ...base, ...ended(v.error) };
  return { ...base, ...live(v) };
}

/** Is the task over (nothing more will change)? */
export const isFinal = (t: Pick<TaskView, 'status'>): boolean => isFinalStatus(t.status);

/** A run's own status word in the canonical set (planned → queued, blocked → waiting on a person). */
const runTaskStatus = (run: Pick<RunState, 'status'>): TaskStatus => normalizeStatus(run.status) ?? 'running';

/**
 * An Agent G multi-step run (lib/agent/run), from its state and, when they were read, its steps' jobs. The run's result
 * is the last result it delivered (a montage after the extraction it was cut to); every step's own result is on the step.
 */
export function taskFromRun(row: TaskRow, run: RunState, children: Readonly<Record<string, ChildView>> = {}, opts: { after?: number } = {}): TaskView {
  const steps: TaskStepView[] = run.steps.map((s) => {
    const c = children[s.id];
    const live = c?.state === 'live' && (s.status === 'queued' || s.status === 'running') ? c : null;
    return {
      id: s.id,
      tool: s.tool,
      capability: s.capability,
      status: normalizeStatus(s.status) ?? 'running',
      taskId: s.taskId ?? null,
      stage: live ? live.stage : null,
      pct: s.status === 'completed' ? 100 : live ? live.pct : null,
      result: s.output ? { url: s.output.url, media: s.output.media, ...(s.output.name ? { name: s.output.name } : {}), ...(s.output.durationSec ? { durationSec: s.output.durationSec } : {}) } : null,
      error: s.error ?? null,
      reused: !!s.reused,
      approval: s.status === 'awaiting_approval' && s.quote ? { credits: s.quote.credits, quoteId: s.quote.quoteId, expiresAt: s.quote.expiresAt } : null,
    };
  });
  const status = runTaskStatus(run);
  const final = isFinalStatus(status);
  const done = steps.filter((s) => s.status === 'completed').length;
  const share = steps.reduce((n, s) => n + (s.status === 'completed' ? 1 : (s.pct ?? 0) / 100), 0);
  const last = [...steps].reverse().find((s) => s.result)?.result ?? null;
  const active = steps.find((s) => s.status === 'running' || s.status === 'queued');
  return {
    ...meta(row),
    kind: 'agent-run',
    status,
    stage: final ? null : status === 'awaiting_approval' ? 'awaiting_approval' : `${Math.min(done + 1, steps.length)}/${steps.length}${active ? `:${active.id}` : ''}`,
    pct: status === 'completed' ? 100 : final ? null : Math.round((share / steps.length) * 100),
    attempt: null,
    result: status === 'completed' || status === 'partially_completed' ? last : null,
    error: final && status !== 'completed' ? (status === 'cancelled' ? 'cancelled' : run.error ?? 'failed') : null,
    cancellable: !final && !run.cancelRequested,
    label: run.spec.title ? run.spec.title.slice(0, LABEL_MAX) : null,
    steps,
    events: opts.after !== undefined ? run.events.filter((e) => e.seq > opts.after!) : run.events,
  };
}
