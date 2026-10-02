/**
 * The Interior designer's and the Photographer's RESULTS — the runs a press started, and the tiles in them. Pure: types, a
 * reducer and the localStorage round-trip, so the rules are tested without React.
 *
 * A RUN is one press of Generate: `photos × count` tiles (one render each, one POST /api/nanobanana/image each, one
 * credit reservation each). A tile moves queued → rendering → ready | error; its progress is the queue's, the picture and
 * the charge are the route's.
 *
 * ⚠️ WHAT SURVIVES A RELOAD IS ONLY WHAT IS SAFE TO SHOW AGAIN: tiles that are READY and whose URL is one of OUR signed
 * storage links (7-day, /storage/v1/object/sign/…). The user's own photos are never written to localStorage (a phone photo
 * is megabytes and private), so a restored run has no `photos` and cannot offer a 3D plan — it is a gallery of what was
 * made, which the Library also holds. A tile still rendering at reload is not restored: the durable job row and the tray
 * own that.
 */
import type { RoomGeometry, StyleGuide } from '@/lib/orchestrator/interior';
import type { ShootKind, StudioWire } from '@/lib/studio/shootWire';
import type { ShootAspect, ShootQuality } from '@/lib/studio/shootQuote';

export type TileStatus = 'queued' | 'rendering' | 'ready' | 'error';

export type PlanState =
  | { status: 'running'; pct: number; stage?: string }
  | { status: 'ready'; geometry: RoomGeometry; style: StyleGuide }
  | { status: 'error'; error: string };

export interface ShootTile {
  id: string;
  /** The queue job rendering it (cancel / durable row); set when the job starts. */
  jobId?: string;
  /** Index into `run.photos`, or -1 for a render from nothing. */
  photoIndex: number;
  variant: number;
  /** The tile's own shape — `auto` resolves per photo, so each picture keeps its room's proportions. */
  aspect: ShootAspect;
  status: TileStatus;
  url?: string;
  error?: string;
  /** Machine code of a failure the panel reacts to (`insufficient_credits` → a top-up action). */
  code?: string;
  startedAt?: number;
  plan?: PlanState;
}

export interface ShootPhotoRef {
  id: string;
  /** A downscaled data URL, or an https URL (a result used as the next reference). */
  src: string;
  w: number;
  h: number;
  name?: string;
}

export interface ShootRun {
  id: string;
  tool: ShootKind;
  createdAt: number;
  /** The panel's own words at submit time („Scandinavian · Living room"), already in the user's language. */
  label: string;
  /** The English caption the render was asked with (the user's brief, or the default) — also its Library caption. */
  prompt: string;
  /** The user's own brief, for the 3D plan's style brief. */
  brief: string;
  quality: ShootQuality;
  wire: StudioWire;
  photos: ShootPhotoRef[];
  tiles: ShootTile[];
}

export type RunsAction =
  | { type: 'add'; run: ShootRun }
  | { type: 'addTile'; runId: string; tile: ShootTile }
  | { type: 'tile'; runId: string; tileId: string; patch: Partial<ShootTile> }
  /** End a tile in error — only if it is still on its way (a reason the runner already wrote is never overwritten). */
  | { type: 'fail'; runId: string; tileId: string; error: string; code?: string }
  /** Drop one tile (a failed one the user dismissed) — and the run itself once nothing is left in it. */
  | { type: 'dropTile'; runId: string; tileId: string }
  | { type: 'dismiss'; runId: string }
  | { type: 'clear'; tool: ShootKind }
  | { type: 'hydrate'; runs: ShootRun[] };

/** Runs kept in memory per tool — the pane is „the latest outputs", not an archive (that is the Library). */
export const MAX_RUNS_PER_TOOL = 6;

const prune = (runs: ShootRun[]): ShootRun[] => {
  const seen: Record<string, number> = {};
  return runs.filter((r) => { seen[r.tool] = (seen[r.tool] ?? 0) + 1; return seen[r.tool]! <= MAX_RUNS_PER_TOOL; });
};

export function runsReducer(state: ShootRun[], a: RunsAction): ShootRun[] {
  switch (a.type) {
    case 'add':
      return prune([a.run, ...state.filter((r) => r.id !== a.run.id)]);
    case 'addTile':
      return state.map((r) => (r.id === a.runId ? { ...r, tiles: [...r.tiles, a.tile] } : r));
    case 'tile':
      return state.map((r) => (r.id !== a.runId ? r : { ...r, tiles: r.tiles.map((t) => (t.id === a.tileId ? { ...t, ...a.patch } : t)) }));
    case 'fail':
      return state.map((r) => (r.id !== a.runId ? r : {
        ...r,
        tiles: r.tiles.map((t) => (t.id === a.tileId && (t.status === 'queued' || t.status === 'rendering')
          ? { ...t, status: 'error' as const, error: a.error, ...(a.code ? { code: a.code } : {}) } : t)),
      }));
    case 'dropTile':
      return state
        .map((r) => (r.id !== a.runId ? r : { ...r, tiles: r.tiles.filter((t) => t.id !== a.tileId) }))
        .filter((r) => r.tiles.length > 0);
    case 'dismiss':
      return state.filter((r) => r.id !== a.runId);
    case 'clear':
      return state.filter((r) => r.tool !== a.tool);
    case 'hydrate': {
      // Whatever is live in memory wins over a restored copy of the same run.
      const have = new Set(state.map((r) => r.id));
      return prune([...state, ...a.runs.filter((r) => !have.has(r.id))].sort((x, y) => y.createdAt - x.createdAt));
    }
    default:
      return state;
  }
}

/** True while any tile of the run is still on its way. */
export const runBusy = (r: ShootRun): boolean => r.tiles.some((t) => t.status === 'queued' || t.status === 'rendering');

// ─── Persistence ─────────────────────────────────────────────────────────────────────────────────────────────────

export const SHOOT_RUNS_KEY = 'myavatar:shoot-runs:v1';
/** Our signed URLs live 7 days (the route signs for 604 800 s); older than 6 days is not worth showing. */
export const RESTORE_MAX_AGE_MS = 6 * 24 * 3600 * 1000;
/** A link into OUR storage — the only kind that is still there tomorrow (a provider's temp URL is gone within hours). */
export const isOurStorageUrl = (u: unknown): u is string =>
  typeof u === 'string' && /^https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/(?:sign|public)\//i.test(u);

/** What goes to localStorage: only READY tiles on our storage, no photos, no plan, no brief of the 3D kind. */
export function serializeRuns(runs: readonly ShootRun[], now: number = Date.now()): string {
  const keep = runs
    .filter((r) => now - r.createdAt < RESTORE_MAX_AGE_MS)
    .map((r) => ({
      id: r.id, tool: r.tool, createdAt: r.createdAt, label: r.label, prompt: r.prompt, brief: r.brief, quality: r.quality, wire: r.wire,
      tiles: r.tiles.filter((t) => t.status === 'ready' && isOurStorageUrl(t.url)).map((t) => ({ id: t.id, photoIndex: t.photoIndex, variant: t.variant, aspect: t.aspect, url: t.url })),
    }))
    .filter((r) => r.tiles.length > 0);
  return JSON.stringify({ v: 1, runs: prune(keep as unknown as ShootRun[]) });
}

const KINDS: readonly string[] = ['interior', 'photoshoot'];
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** The inverse, strict: anything that is not exactly what serializeRuns writes is dropped, never trusted. */
export function parseRuns(raw: string | null | undefined, now: number = Date.now()): ShootRun[] {
  if (!raw) return [];
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return []; }
  const arr = (j as { v?: unknown; runs?: unknown } | null)?.v === 1 && Array.isArray((j as { runs: unknown[] }).runs) ? (j as { runs: unknown[] }).runs : [];
  const out: ShootRun[] = [];
  for (const x of arr.slice(0, 24)) {
    const r = (x ?? {}) as Record<string, unknown>;
    if (typeof r.id !== 'string' || !KINDS.includes(r.tool as string) || typeof r.createdAt !== 'number' || !Array.isArray(r.tiles)) continue;
    if (now - r.createdAt >= RESTORE_MAX_AGE_MS || r.createdAt > now + 60_000) continue;
    const tiles: ShootTile[] = [];
    for (const y of (r.tiles as unknown[]).slice(0, 16)) {
      const t = (y ?? {}) as Record<string, unknown>;
      if (typeof t.id !== 'string' || !isOurStorageUrl(t.url)) continue;
      tiles.push({
        id: t.id.slice(0, 80), photoIndex: typeof t.photoIndex === 'number' ? t.photoIndex : -1, variant: typeof t.variant === 'number' ? t.variant : 0,
        aspect: typeof t.aspect === 'string' && /^\d{1,2}:\d{1,2}$/.test(t.aspect) ? (t.aspect as ShootAspect) : '1:1', status: 'ready', url: t.url,
      });
    }
    if (!tiles.length) continue;
    const wire = (r.wire && typeof r.wire === 'object' ? r.wire : { kind: r.tool }) as StudioWire;
    out.push({
      id: r.id.slice(0, 80), tool: r.tool as ShootKind, createdAt: r.createdAt, label: str(r.label, 120), prompt: str(r.prompt, 600), brief: str(r.brief, 600),
      quality: r.quality === 'standard' || r.quality === 'ultra' ? r.quality : 'high', wire, photos: [], tiles,
    });
  }
  return prune(out.sort((a, b) => b.createdAt - a.createdAt));
}
