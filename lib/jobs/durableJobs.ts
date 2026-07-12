/**
 * Durable progress — hydrate the JobTray from the server-side `generation_jobs` feed.
 * ==================================================================================
 *
 * The capped-parallel JobTray is client-state, so a page reload used to lose every
 * in-flight render's progress. This maps the authenticated user's ACTIVE
 * `generation_jobs` rows (fetched from GET /api/orchestrator/jobs?status=active) into the
 * same `Job` shape the tray already renders, so a reload re-hydrates live bars synced to
 * the DB `pct` + `current_stage`.
 *
 * These are OBSERVED jobs (`observed: true`): the render runs server-side, so there is no
 * local runner to cancel — the tray shows their progress read-only and refreshes it by
 * polling. Pure + deterministic (no clock/fetch here) → unit-testable with plain fixtures.
 */

import type { GenerationJobRow } from '@/lib/orchestrator/jobs';
import type { ProduceKind } from '@/lib/orchestrator/rate-limit';
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

/** Pull a short human label out of the row's params (the brief/prompt), else the kind. */
function labelFor(row: GenerationJobRow, kind: JobKind, locale: Lang): string {
  const p = row.params as Record<string, unknown> | null | undefined;
  const brief = p && (typeof p.prompt === 'string' ? p.prompt : typeof p.brief === 'string' ? p.brief : typeof p.title === 'string' ? p.title : '');
  const trimmed = (brief || '').trim();
  return trimmed ? trimmed.slice(0, 42) : (KIND_LABEL[kind]?.[locale] ?? KIND_LABEL[kind]?.en ?? 'Render');
}

/**
 * Map one `generation_jobs` row to the tray `Job` shape. completed → 'done' (pct forced 100);
 * failed → 'failed'; a `pending` row that still carries a `position_in_queue` → 'queued' (a job
 * WAITING in the queue, recovered across a reload); everything else in-flight → 'rendering'.
 * `current_stage` becomes the stage line, `pct` the bar. Always `observed: true` (no local runner).
 */
export function mapDbJobToTrayJob(row: GenerationJobRow, locale: Lang = 'ka'): Job {
  const kind = KIND_BY_SERVICE[row.service_type] ?? 'video';
  const queuePos = typeof row.position_in_queue === 'number' && row.position_in_queue > 0 ? Math.floor(row.position_in_queue) : null;
  const status: Job['status'] =
    row.status === 'completed' ? 'done'
    : row.status === 'failed' ? 'failed'
    : (row.status === 'pending' && queuePos != null) ? 'queued'
    : 'rendering';
  const pct = status === 'done' ? 100 : status === 'queued' ? 0 : clampPct(row.pct);
  return {
    id: row.id,
    kind,
    label: labelFor(row, kind, locale),
    status,
    pct,
    // A queued job shows its position, not a stage line.
    stage: status === 'queued' ? null : (row.current_stage ?? null),
    position: status === 'queued' ? queuePos : null,
    error: row.error ?? null,
    result: row.result ?? null,
    createdAt: Date.parse(row.created_at) || 0,
    startedAt: null,
    endedAt: status === 'done' || status === 'failed' ? (Date.parse(row.updated_at) || 0) : null,
    observed: true,
  };
}

/**
 * A `generation_jobs` row still marked pending|processing but older than this is a PHANTOM — an
 * orphaned render (the server died / the lambda timed out without ever writing failed|completed). The
 * longest real job (a 60s film + its ~10min assemble, plus queue wait) finishes well under this, so any
 * "active" row this old is dead. Dropping it stops the JobTray from showing a perpetual spinner on reload
 * (the reported "infinite loading spinner / phantom execution cache"). Overridable for tests.
 */
export const STALE_ACTIVE_MS = 30 * 60 * 1000; // 30 minutes

/** Freshest timestamp on the row (updated_at reflects progress; created_at is the fallback). 0 = unknown. */
function rowFreshnessMs(row: GenerationJobRow): number {
  const updated = Date.parse(row.updated_at) || 0;
  const created = Date.parse(row.created_at) || 0;
  return Math.max(updated, created);
}

/**
 * Map the server's active rows to observed tray jobs, keeping ONLY still-running ones
 * (pending|processing) that are NOT stale phantoms. A completed/failed render drops out on the next
 * poll; an orphaned row older than STALE_ACTIVE_MS is dropped too (so a dead job never spins forever).
 * Restores the QUEUE LAYOUT across a reload: rendering jobs first (oldest-first), then the waiting jobs
 * ordered by their persisted queue position. `nowMs` is injected so the age gate stays unit-testable.
 */
export function mapActiveDbJobs(rows: readonly GenerationJobRow[], locale: Lang = 'ka', nowMs: number = Date.now()): Job[] {
  const jobs = rows
    .filter((r) => r.status === 'pending' || r.status === 'processing')
    // Drop orphaned phantoms: an active row whose freshest timestamp is older than the max render window.
    // A row with NO parseable timestamp (freshness 0) is kept — never punish missing metadata.
    .filter((r) => { const f = rowFreshnessMs(r); return f === 0 || nowMs - f < STALE_ACTIVE_MS; })
    .map((r) => mapDbJobToTrayJob(r, locale));
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
