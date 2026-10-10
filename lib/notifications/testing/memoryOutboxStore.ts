/**
 * In-memory OutboxStores with the live store's semantics (lib/notifications/outboxLive supabaseOutboxStore): a write
 * lands only while the row is final and its `_tell.v` and `_exec.v` still match what the writer read.
 *
 *   memoryOutboxStore   rows of its own (plain jobs, charged renders)
 *   outboxOverLease     the SAME rows as a MemoryLeaseStore, so the lease queue's writes (a refund cleared, a run's
 *                       last tick) and the outbox's interleave exactly as they do on generation_jobs
 */
import { execOf } from '@/lib/orchestrator/jobLease';
import type { MemoryLeaseStore } from '@/lib/orchestrator/testing/memoryLeaseStore';
import { FRESH_MS, tellOf, type OutboxRow, type OutboxStore } from '../outbox';

const FINAL = ['completed', 'failed'];
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const tellV = (params: Record<string, unknown>): number | null => tellOf(params)?.v ?? null;
const execV = (params: Record<string, unknown>): number | null => execOf(params)?.v ?? null;
const due = (r: OutboxRow, now: number): boolean => {
  if (!FINAL.includes(r.status) || r.params._parent) return false;
  const t = tellOf(r.params);
  return t ? !t.done : now - r.updatedAt <= FRESH_MS;
};

export interface MemoryOutboxStore extends OutboxStore {
  rows: Map<string, OutboxRow>;
  writes: number;
  /** Called before every compare-and-set; a test interleaves a competing write here. */
  beforeCas?: (id: string) => Promise<void> | void;
}

export function memoryOutboxStore(now: () => number): MemoryOutboxStore {
  const rows = new Map<string, OutboxRow>();
  const store: MemoryOutboxStore = {
    rows,
    writes: 0,
    async read(id) {
      const r = rows.get(id);
      return r ? copy(r) : null;
    },
    async cas(id, expect, params) {
      if (store.beforeCas) await store.beforeCas(id);
      const r = rows.get(id);
      if (!r || !FINAL.includes(r.status) || tellV(r.params) !== expect.tellV || execV(r.params) !== expect.execV) return false;
      r.params = copy(params);
      r.updatedAt = now();
      store.writes += 1;
      return true;
    },
    async listDue(at, limit) {
      return [...rows.values()].filter((r) => due(r, at)).slice(0, limit).map(copy);
    },
  };
  return store;
}

/** The outbox's view of a MemoryLeaseStore's rows. `updatedAt` is the clock (the lease store keeps no such column). */
export function outboxOverLease(lease: MemoryLeaseStore, now: () => number, serviceType: (id: string) => string = () => 'film'): OutboxStore {
  const view = (id: string): OutboxRow | null => {
    const r = lease.rows.get(id);
    return r ? { id: r.id, userId: r.userId, status: r.status, serviceType: serviceType(r.id), params: copy(r.params), error: r.error, updatedAt: now() } : null;
  };
  return {
    async read(id) { return view(id); },
    async cas(id, expect, params) {
      const r = lease.rows.get(id);
      if (!r || !FINAL.includes(r.status) || tellV(r.params) !== expect.tellV || execV(r.params) !== expect.execV) return false;
      r.params = copy(params);
      r.exec = execOf(r.params);
      return true;
    },
    async listDue(at, limit) {
      return [...lease.rows.keys()].map(view).filter((r): r is OutboxRow => !!r && due(r, at)).slice(0, limit);
    },
  };
}
