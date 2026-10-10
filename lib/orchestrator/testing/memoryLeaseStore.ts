/**
 * An in-memory LeaseStore with the live store's semantics (lib/orchestrator/jobLease supabaseLeaseStore): an insert of
 * a taken id answers 'exists'; a compare-and-set lands only when the status and _exec.v still match; a progress write
 * only while the row is processing under that owner. `crash` makes the next writes fail like a dropped connection.
 */
import { execOf, type LeaseRow, type LeaseStore, type LeaseWrite } from '../jobLease';

export interface MemoryLeaseStore extends LeaseStore {
  rows: Map<string, LeaseRow>;
  /** How many writes landed, per kind of write. */
  writes: { cas: number; progress: number };
  /** While true every write answers "did not happen". */
  down: boolean;
  /** Called before every compare-and-set; a test interleaves a competing write here. */
  beforeCas?: (id: string) => Promise<void> | void;
}

export function memoryLeaseStore(now: () => number = () => Date.now()): MemoryLeaseStore {
  const rows = new Map<string, LeaseRow>();
  const copy = (r: LeaseRow): LeaseRow => JSON.parse(JSON.stringify(r)) as LeaseRow;
  const store: MemoryLeaseStore = {
    rows,
    writes: { cas: 0, progress: 0 },
    down: false,
    async insert(row) {
      if (store.down) return 'error';
      if (rows.has(row.id)) return 'exists';
      rows.set(row.id, {
        id: row.id, userId: row.userId, status: 'pending', stage: 'queued', pct: 0, params: row.params, exec: execOf(row.params),
        createdAt: now(), error: null, result: null, signedUrl: null,
      });
      return 'inserted';
    },
    async read(id) {
      const r = rows.get(id);
      return r ? copy(r) : null;
    },
    async cas(id, expect, w: LeaseWrite) {
      if (store.beforeCas) await store.beforeCas(id);
      if (store.down) return false;
      const r = rows.get(id);
      if (!r || !r.exec || r.exec.v !== expect.v || !expect.from.includes(r.status)) return false;
      const params = JSON.parse(JSON.stringify(w.params)) as Record<string, unknown>;
      Object.assign(r, {
        params,
        exec: execOf(params),
        ...(w.status !== undefined ? { status: w.status } : {}),
        ...(w.stage !== undefined ? { stage: w.stage } : {}),
        ...(w.pct !== undefined ? { pct: w.pct } : {}),
        ...(w.error !== undefined ? { error: w.error } : {}),
        ...(w.result !== undefined ? { result: w.result } : {}),
        ...(w.signedUrl !== undefined ? { signedUrl: w.signedUrl } : {}),
      });
      store.writes.cas += 1;
      return true;
    },
    async progress(id, owner, stage, pct) {
      if (store.down) return false;
      const r = rows.get(id);
      if (!r || r.status !== 'processing' || r.exec?.owner !== owner) return false;
      r.stage = stage;
      r.pct = pct;
      store.writes.progress += 1;
      return true;
    },
    async listLive(kind, limit) {
      return [...rows.values()].filter((r) => (r.status === 'pending' || r.status === 'processing') && r.exec?.kind === kind)
        .sort((a, b) => a.createdAt - b.createdAt).slice(0, limit).map(copy);
    },
    async listOwed(kind, limit) {
      return [...rows.values()].filter((r) => (r.status === 'failed' || r.status === 'completed') && r.exec?.kind === kind && r.exec.owe === 'refund')
        .slice(0, limit).map(copy);
    },
  };
  return store;
}
