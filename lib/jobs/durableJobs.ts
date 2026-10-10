/**
 * Durable progress — hydrate the JobTray from the caller's tasks (one Task API, EF-7: app/api/tasks).
 * ==================================================================================
 *
 * The capped-parallel JobTray is client-state, so a page reload used to lose every
 * in-flight render's progress. This maps the authenticated user's ACTIVE tasks
 * (GET /api/tasks?active=1, one TaskView per `generation_jobs` row) into the same `Job`
 * shape the tray already renders, so a reload re-hydrates live bars synced to the DB
 * `pct` + `current_stage`.
 *
 * These are OBSERVED jobs (`observed: true`): the work runs server-side, so there is no
 * local runner to cancel. A studio render shows its progress read-only; an Agent G job
 * (montage, MP3 extraction, edit) the server CAN stop carries `cancellable`, and the tray's
 * cancel goes to POST /api/tasks. Pure + deterministic (no clock/fetch here).
 */

import type { ProduceKind } from '@/lib/orchestrator/rate-limit';
import type { TaskView } from '@/lib/tasks/taskView';
import { isLiveStatus } from '@/lib/tasks/statusModel';
import { stageText } from '@/lib/agent/media/montageChat';
import { audioStageText } from '@/lib/agent/media/audioChat';
import { editStageText } from '@/lib/agent/media/editChat';
import type { Job, JobKind } from './jobQueue';

type Lang = 'ka' | 'en' | 'ru';

/** generation_jobs.service_type → the tray's JobKind (icon + grouping). */
const KIND_BY_SERVICE: Record<ProduceKind, JobKind> = {
  film: 'video',
  avatar: 'avatar',
  image: 'image',
  music: 'music',
  voice: 'music',
  interior: 'image',
};

/**
 * Inverse (write-side): a tray JobKind → a VALID generation_jobs.service_type. The table's
 * CHECK constraint only allows film|avatar|interior|image|music|voice, so the composer's
 * 'product'/'remix'/'video' kinds (all video renders) collapse to 'film'. Used when the
 * local composer persists a placeholder row so its progress survives a reload.
 */
export function serviceTypeForKind(kind: JobKind | string | undefined): ProduceKind {
  switch (kind) {
    case 'image':
      return 'image';
    case 'music':
      return 'music';
    case 'avatar':
    case 'lipsync':
      return 'avatar';
    case 'video':
    case 'product':
    case 'remix':
    default:
      return 'film';
  }
}

/** Localized fallback label per kind (when the row carries no usable prompt). */
const KIND_LABEL: Record<JobKind, Record<Lang, string>> = {
  video: { en: 'Video', ru: 'Видео', ka: 'ვიდეო' },
  music: { en: 'Music', ru: 'Музыка', ka: 'მუსიკა' },
  avatar: { en: 'Avatar', ru: 'Аватар', ka: 'ავატარი' },
  image: { en: 'Image', ru: 'Изображение', ka: 'სურათი' },
  product: { en: 'Product ad', ru: 'Реклама', ka: 'რეკლამა' },
  remix: { en: 'Remix', ru: 'Ремикс', ka: 'რემიქსი' },
  lipsync: { en: 'Lip-sync', ru: 'Синхрон', ka: 'სინქრონი' },
};

const clampPct = (n: unknown): number => {
  const v = Number(n);
  return !Number.isFinite(v) ? 0 : v < 0 ? 0 : v > 100 ? 100 : Math.round(v);
};

/**
 * Agent G's lease kinds (lib/tasks TaskView.kind): what the tray calls them, which icon they take, and their stage
 * codes in words (the same words their chat card shows).
 */
const LEASE_KIND: Record<string, { kind: JobKind; label: Record<Lang, string>; stage: (code: string, locale: Lang) => string; ownLabel?: true }> = {
  'agent-montage': { kind: 'video', label: { en: 'Agent G · montage', ru: 'Agent G · монтаж', ka: 'Agent G · მონტაჟი' }, stage: stageText },
  'agent-audio-extract': { kind: 'music', label: { en: 'Agent G · MP3', ru: 'Agent G · MP3', ka: 'Agent G · MP3' }, stage: audioStageText },
  'agent-media-edit': { kind: 'video', label: { en: 'Agent G · edit', ru: 'Agent G · правка', ka: 'Agent G · რედაქტირება' }, stage: editStageText },
  // A run is named by what the user asked for (its plan's title) when it has one.
  'agent-run': { kind: 'video', label: { en: 'Agent G · steps', ru: 'Agent G · шаги', ka: 'Agent G · ნაბიჯები' }, stage: runStageText, ownLabel: true },
};

/** A run's stage („2/3:clip", or „awaiting_approval") in words: which step of how many, or that it waits for the user. */
function runStageText(code: string, locale: Lang): string {
  if (code === 'awaiting_approval') return { en: 'Waiting for your yes', ru: 'Жду вашего решения', ka: 'ველოდები შენს დასტურს' }[locale];
  const m = /^(\d+)\/(\d+)/.exec(code);
  if (!m) return code;
  return { en: `Step ${m[1]} of ${m[2]}`, ru: `Шаг ${m[1]} из ${m[2]}`, ka: `ნაბიჯი ${m[1]} / ${m[2]}` }[locale];
}

/** The tray's row label is short; a task's own words are cut to this. */
const TRAY_LABEL_MAX = 42;

/**
 * Map one task to the tray `Job` shape. completed → 'done' (pct forced 100); failed / cancelled → 'failed' /
 * 'canceled'; a queued studio render that still carries its queue `position` → 'queued' (a job WAITING in the
 * client queue, recovered across a reload); everything else in flight → 'rendering'. The stage line and the bar come
 * from the task; `cancellable` is the server's word that it can stop this job. Always `observed: true`.
 */
export function mapTaskToTrayJob(task: TaskView, locale: Lang = 'ka'): Job {
  const lease = LEASE_KIND[task.kind];
  const kind = lease?.kind ?? KIND_BY_SERVICE[task.service as ProduceKind] ?? 'video';
  // The tray's own five words (lib/jobs/jobQueue) for the canonical statuses (lib/tasks/statusModel): a run that delivered
  // part of its results is done (its card says which); one waiting for the user's yes is waiting, not rendering.
  const status: Job['status'] =
    task.status === 'completed' || task.status === 'partially_completed' ? 'done'
    : task.status === 'failed' ? 'failed'
    : task.status === 'cancelled' ? 'canceled'
    : (task.status === 'queued' && task.position != null) || task.status === 'awaiting_approval' ? 'queued'
    : 'rendering';
  const live = status === 'queued' || status === 'rendering';
  const pct = status === 'done' ? 100 : status === 'queued' ? 0 : clampPct(task.pct);
  const own = (task.label ?? '').trim();
  const label = lease && !(lease.ownLabel && own) ? (lease.label[locale] ?? lease.label.en)
    : own ? own.slice(0, TRAY_LABEL_MAX)
    : (KIND_LABEL[kind]?.[locale] ?? KIND_LABEL[kind]?.en ?? 'Render');
  const createdAt = (task.createdAt && Date.parse(task.createdAt)) || 0;
  const updatedAt = (task.updatedAt && Date.parse(task.updatedAt)) || 0;
  return {
    id: task.id,
    kind,
    label,
    status,
    pct,
    // A queued job shows its position, not a stage line (a run waiting for a yes says so); a lease job's stage is a
    // code, shown in words.
    stage: status === 'queued' && task.status !== 'awaiting_approval' ? null : task.stage && lease ? lease.stage(task.stage, locale) : task.stage,
    position: status === 'queued' ? task.position : null,
    error: task.error,
    result: task.result,
    createdAt,
    startedAt: null,
    endedAt: live ? null : updatedAt,
    observed: true,
    cancellable: live && task.cancellable,
  };
}

/**
 * An active task still marked queued|running but older than this is a PHANTOM — an orphaned render (the server
 * died / the lambda timed out without ever writing failed|completed). The longest real job (a 60s film + its ~10min
 * assemble, plus queue wait) finishes well under this, so any "active" task this old is dead. Dropping it stops the
 * JobTray from showing a perpetual spinner on reload. Overridable for tests.
 */
export const STALE_ACTIVE_MS = 30 * 60 * 1000; // 30 minutes

/** Freshest timestamp on the task (updatedAt reflects progress; createdAt is the fallback). 0 = unknown. */
function taskFreshnessMs(t: TaskView): number {
  const updated = (t.updatedAt && Date.parse(t.updatedAt)) || 0;
  const created = (t.createdAt && Date.parse(t.createdAt)) || 0;
  return Math.max(updated, created);
}

/**
 * Map the server's active tasks to observed tray jobs, keeping ONLY still-live ones (queued, waiting for a yes,
 * running) that are NOT stale phantoms, and not the steps of a multi-step run (the run's own row stands for them). A
 * finished task drops out on the next poll; an orphaned one older than STALE_ACTIVE_MS is dropped too (so a dead job
 * never spins forever). Restores the QUEUE LAYOUT across a reload: rendering jobs first
 * (oldest-first), then the waiting jobs ordered by their persisted queue position. `nowMs` is injected for tests.
 */
export function mapActiveTasks(tasks: readonly TaskView[], locale: Lang = 'ka', nowMs: number = Date.now()): Job[] {
  const jobs = tasks
    .filter((t) => isLiveStatus(t.status))
    // A step of a multi-step run is shown by its run (one row per thing the user asked for).
    .filter((t) => !t.parentId)
    // Drop orphaned phantoms. A task with NO parseable timestamp (freshness 0) is kept — never punish missing metadata.
    .filter((t) => { const f = taskFreshnessMs(t); return f === 0 || nowMs - f < STALE_ACTIVE_MS; })
    .map((t) => mapTaskToTrayJob(t, locale));
  const rendering = jobs.filter((j) => j.status === 'rendering').sort((a, b) => a.createdAt - b.createdAt);
  const queued = jobs.filter((j) => j.status === 'queued').sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt - b.createdAt);
  return [...rendering, ...queued];
}

/**
 * Merge locally-run queue jobs with server-observed durable jobs for the tray. Dedup by id
 * (a locally-run job always wins over an observed row of the same id, so we never double-
 * render one job). Observed jobs render first (they're the older, already-in-flight work).
 */
export function mergeTrayJobs(local: readonly Job[], durable: readonly Job[]): Job[] {
  const localIds = new Set(local.map((j) => j.id));
  return [...durable.filter((j) => !localIds.has(j.id)), ...local];
}
