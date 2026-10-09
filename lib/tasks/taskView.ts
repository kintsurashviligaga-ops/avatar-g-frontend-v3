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

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
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
  createdAt: string | null;
  updatedAt: string | null;
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
}

/** Ids are generation_jobs keys: a UUID for Agent G, `prod_<ms>_<rand>`-style for studio renders. */
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
export function parseTaskId(x: unknown): string | null {
  return typeof x === 'string' && ID.test(x) ? x : null;
}

const MEDIA: Record<string, TaskMedia> = { film: 'video', avatar: 'video', interior: 'image', image: 'image', music: 'audio', voice: 'audio' };
const meta = (row: TaskRow) => ({ id: row.id, service: row.service_type, createdAt: row.created_at, updatedAt: row.updated_at });
const str = (x: unknown): string | null => (typeof x === 'string' && x ? x : null);

/** A studio render (no lease): the row's own columns. */
export function taskFromRow(row: TaskRow): TaskView {
  const r = row.result ?? {};
  const base = { ...meta(row), kind: 'render', attempt: null, cancellable: false };
  if (row.status === 'completed') {
    const url = str(row.signed_url) ?? str(r.url) ?? str(r.videoUrl) ?? str(r.audioUrl) ?? str(r.imageUrl);
    return {
      ...base, status: 'completed', stage: null, pct: 100, error: null,
      result: url ? { url, media: MEDIA[row.service_type] ?? 'file' } : null,
    };
  }
  if (row.status === 'failed') {
    const cancelled = /^cancel/i.test(row.error ?? '');
    return { ...base, status: cancelled ? 'cancelled' : 'failed', stage: null, pct: null, result: null, error: cancelled ? 'cancelled' : 'failed' };
  }
  return {
    ...base, status: row.status === 'pending' ? 'queued' : 'running',
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
export const isFinal = (t: Pick<TaskView, 'status'>): boolean => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled';
