/**
 * lib/studio/modelPick.ts — the model a person picked, per service, remembered in THIS browser; and what a picker may offer.
 *
 * The pick is a device preference like the music engine (lib/studio/musicEnginePref): localStorage behind try/catch
 * everywhere (private mode, blocked storage and quota all degrade to the service's default), one tiny external store so
 * every view of the same service agrees, and read again at REQUEST time (`imageModelField`) — so a re-roll uses what is
 * picked when it is pressed. The server validates the id again; a stale or forged pick can never run a model it refuses.
 *
 * Two memories, because two surfaces run different sets: the Create panels (`create`) and Studio β (`studio`). A Kling pick
 * in Studio β must not turn the Video panel's next film into a request its route cannot take.
 */
import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_MODEL,
  catalogueEntry,
  catalogueFor,
  type Availability,
  type CatalogueEntry,
  type CatalogueService,
  type ModelRunner,
  type UnavailableReason,
} from '@/lib/providers/catalogue';

export type PickScope = 'create' | 'studio';

export const modelPickKey = (service: CatalogueService, scope: PickScope = 'create'): string =>
  scope === 'studio' ? `myavatar:studio:model:${service}` : `myavatar:model:${service}`;

const listeners = new Set<() => void>();

function storage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** The stored pick if it is still a model of that service; null otherwise (unread, unknown, another service's id). */
export function getModelPick(service: CatalogueService, scope: PickScope = 'create'): string | null {
  try {
    const raw = storage()?.getItem(modelPickKey(service, scope));
    return catalogueEntry(raw)?.service === service ? raw! : null;
  } catch {
    return null;
  }
}

export function setModelPick(service: CatalogueService, id: string, scope: PickScope = 'create'): void {
  if (catalogueEntry(id)?.service !== service) return;
  const key = modelPickKey(service, scope);
  try {
    const s = storage();
    if (!s) throw new Error('no storage');
    if (id === DEFAULT_MODEL[service]) s.removeItem(key);
    else s.setItem(key, id);
    memory.delete(key);
  } catch {
    memory.set(key, id); // private mode / quota — the pick lives for this page only
  }
  listeners.forEach((l) => l());
}

/** Picks made where storage refuses writes still hold for this page. */
const memory = new Map<string, string>();

function read(service: CatalogueService, scope: PickScope): string | null {
  return getModelPick(service, scope) ?? memory.get(modelPickKey(service, scope)) ?? null;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // A pick made in another tab.
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key.startsWith('myavatar:model:') || e.key.startsWith('myavatar:studio:model:')) cb(); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** [stored pick or null, set] — the server snapshot is null, so the first client render matches the server's. */
export function useModelPick(service: CatalogueService, scope: PickScope = 'create'): readonly [string | null, (id: string) => void] {
  const pick = useSyncExternalStore(subscribe, () => read(service, scope), () => null);
  const set = useCallback((id: string) => setModelPick(service, id, scope), [service, scope]);
  return [pick, set] as const;
}

/** Test hook. */
export function __resetModelPickMemory(): void {
  memory.clear();
}

// ── the request ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The image request's `model` (POST /api/nanobanana/image): the stored pick when the image route can run it, else Auto.
 * ⚠️ ALWAYS PRESENT — the server quotes and charges the model the request names, so a request that left it out would be
 * priced as Auto whatever the screen said.
 */
export function imageModelField(): { model: string } {
  const e = catalogueEntry(read('image', 'create'));
  return { model: e && e.wire.runner === 'image' ? e.id : DEFAULT_MODEL.image };
}

// ── what a picker may offer ─────────────────────────────────────────────────────────────────────────────────────────

/** Why a row cannot be picked HERE: the server's reason, or that it runs on another surface, or not known yet. */
export type PickBlock = UnavailableReason | 'elsewhere' | 'checking';

export interface PickerRow {
  entry: CatalogueEntry;
  selectable: boolean;
  block: PickBlock | null;
}

/** GET /api/studio/catalogue as a map; null = not read (or the read failed). */
export type CatalogueStatus = Readonly<Record<string, Availability>>;

/**
 * The rows of a picker on a surface that runs `runners`: the ones a tap may choose first (catalogue order), then the rest,
 * each with why not. ⚠️ WHILE THE STATUS IS UNKNOWN, a row of the surface's own route stays selectable (that route always
 * took any of them, and refuses for itself) — but a Higgsfield row does not: it is gated by flags this browser cannot see.
 */
export function pickerRows(
  service: CatalogueService,
  o: { runners: readonly ModelRunner[]; status: CatalogueStatus | null; include?: 'all' | 'runnable' },
): PickerRow[] {
  const rows: PickerRow[] = [];
  for (const entry of catalogueFor(service)) {
    const here = o.runners.includes(entry.wire.runner);
    if (!here && o.include === 'runnable') continue;
    const st = o.status?.[entry.id];
    if (here) {
      if (st) rows.push({ entry, selectable: st.available, block: st.available ? null : st.reason ?? 'not_enabled' });
      else if (entry.wire.runner === 'studio') rows.push({ entry, selectable: false, block: o.status ? 'not_enabled' : 'checking' });
      else rows.push({ entry, selectable: true, block: null });
    } else {
      // Runs somewhere else: say where only when that place can run it; otherwise why it cannot run at all.
      rows.push({ entry, selectable: false, block: st?.available ? 'elsewhere' : st?.reason ?? 'not_enabled' });
    }
  }
  return [...rows.filter((r) => r.selectable), ...rows.filter((r) => !r.selectable)];
}

/** The model a request will actually name: the pick if a tap could choose it now, else the default, else the first open row. */
export function effectivePick(service: CatalogueService, pick: string | null, rows: readonly PickerRow[]): string {
  const open = rows.filter((r) => r.selectable).map((r) => r.entry.id);
  if (pick && open.includes(pick)) return pick;
  if (open.includes(DEFAULT_MODEL[service])) return DEFAULT_MODEL[service];
  return open[0] ?? DEFAULT_MODEL[service];
}
