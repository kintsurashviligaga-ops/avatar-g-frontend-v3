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
 * Map one `generation_jobs` row to the tray `Job` shape. pending|processing → 'rendering';
 * completed → 'done' (pct forced 100); failed → 'failed'. `current_stage` becomes the
 * stage line, `pct` the bar. Always `observed: true` (no local runner).
 */
export function mapDbJobToTrayJob(row: GenerationJobRow, locale: Lang = 'ka'): Job {
  const kind = KIND_BY_SERVICE[row.service_type] ?? 'video';
  const status: Job['status'] =
    row.status === 'completed' ? 'done' : row.status === 'failed' ? 'failed' : 'rendering';
  const pct = status === 'done' ? 100 : clampPct(row.pct);
  return {
    id: row.id,
    kind,
    label: labelFor(row, kind, locale),
    status,
    pct,
    stage: row.current_stage ?? null,
    position: null,
    error: row.error ?? null,
    result: row.result ?? null,
    createdAt: Date.parse(row.created_at) || 0,
    startedAt: null,
    endedAt: status === 'done' || status === 'failed' ? (Date.parse(row.updated_at) || 0) : null,
    observed: true,
  };
}

/**
 * Map the server's active rows to observed tray jobs, keeping ONLY still-running ones
 * (pending|processing) — a completed/failed render drops out on the next poll rather than
 * lingering. Sorted oldest-first so the tray order is stable across refreshes.
 */
export function mapActiveDbJobs(rows: readonly GenerationJobRow[], locale: Lang = 'ka'): Job[] {
  return rows
    .filter((r) => r.status === 'pending' || r.status === 'processing')
    .map((r) => mapDbJobToTrayJob(r, locale))
    .sort((a, b) => a.createdAt - b.createdAt);
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
