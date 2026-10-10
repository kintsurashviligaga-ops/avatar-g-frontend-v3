/**
 * lib/orchestrator/jobLease.ts — a durable work queue on generation_jobs rows, with leases. No new table.
 *
 * WHY. A render that runs inside the request that asked for it dies with that request: a phone that locks, a proxy
 * that times out, a function killed at its limit. The row then says `processing` forever, nobody retries it, and a
 * refund waits for a drainer that may be switched off. Here the request only ENQUEUES; a worker CLAIMS the row with a
 * lease it must keep renewing, and a row whose lease ran out is claimed again (a retry) or, once its attempts are
 * spent, failed and refunded. Whoever runs the worker (the request after its answer, the owner's status poll, the
 * per-minute sweep, later a dedicated host) speaks the same protocol, so nothing here depends on where it runs.
 *
 * THE STATE lives in `params._exec` (generation_jobs.params is JSONB; no migration):
 *
 *   kind         which worker runs the row ('agent-montage')
 *   v            version. Every change of _exec bumps it, and every such write is a compare-and-set on the version it
 *                read (PATCH … WHERE params->_exec->>v = <read> AND status IN <allowed>). Two workers, a cancel and
 *                the sweep can race on one row; exactly one write wins and the others learn it from the answer.
 *   attempt      claims so far; maxAttempts caps them (a crash is retried, a crash loop is not)
 *   owner        the worker holding the lease, leaseUntil when it lapses (epoch ms)
 *   hold         'billing' while the enqueuing request is still charging for the job: no worker may claim it yet.
 *                Released by that request once the charge landed; a hold older than HOLD_MS (the request died) is
 *                failed by the sweep, owing whatever was charged.
 *   owe          an effect still owed after a final transition (the outbox entry): 'refund' is written in the SAME
 *                write that fails the row, and cleared only after the refund landed. A worker that dies in between
 *                leaves the debt on the row, and the sweep pays it (the ledger dedupes the refund by its ref).
 *
 * Stage and percent writes do not touch _exec: they land only while the row is `processing` AND the writer still
 * owns the lease, so a worker that lost its lease (or a cancelled job) can no longer move the row.
 *
 * Every function is a plain function over an injected store (supabaseLeaseStore below is the live one), so every
 * race is tested against an in-memory store with the same semantics.
 */
import type { JobStatus } from './jobs';
import type { ProduceKind } from './rate-limit';

/** How long a claim lasts without a heartbeat. A worker renews it every HEARTBEAT_MS. */
export const LEASE_MS = 90_000;
export const HEARTBEAT_MS = 15_000;
/** One retry after a crash. A render that fails on its own (bad media, QC) is final at once. */
export const MAX_ATTEMPTS = 2;
/** A billing hold older than this means the request that was charging died. */
export const HOLD_MS = 120_000;

const LIVE: readonly JobStatus[] = ['pending', 'processing'];

export interface ExecState {
  kind: string;
  v: number;
  attempt: number;
  maxAttempts: number;
  owner: string | null;
  leaseUntil: number | null;
  hold?: 'billing';
  owe?: 'refund';
  lastError?: string;
}

export interface LeaseRow {
  id: string;
  userId: string;
  status: JobStatus;
  stage: string | null;
  pct: number;
  params: Record<string, unknown>;
  exec: ExecState | null;
  createdAt: number;
  error: string | null;
  result: Record<string, unknown> | null;
  signedUrl: string | null;
}

export interface LeaseWrite {
  status?: JobStatus;
  stage?: string;
  pct?: number;
  error?: string | null;
  result?: Record<string, unknown>;
  signedUrl?: string | null;
  /** The whole params object (read, changed, written back): it carries the new _exec. */
  params: Record<string, unknown>;
}

export interface LeaseStore {
  insert(row: { id: string; userId: string; serviceType: ProduceKind; params: Record<string, unknown> }): Promise<'inserted' | 'exists' | 'error'>;
  read(id: string): Promise<LeaseRow | null>;
  /** Write iff the row's status is in `from` and its _exec.v is still `v`. True when it did. */
  cas(id: string, expect: { v: number; from: readonly JobStatus[] }, write: LeaseWrite): Promise<boolean>;
  /** Stage and percent only, iff the row is processing and `owner` holds its lease. */
  progress(id: string, owner: string, stage: string, pct: number): Promise<boolean>;
  /** Live rows (pending, processing) of one kind, oldest first. */
  listLive(kind: string, limit: number): Promise<LeaseRow[]>;
  /** Final rows of one kind that still owe an effect. */
  listOwed(kind: string, limit: number): Promise<LeaseRow[]>;
}

/** Read `_exec` off a params object; null when the row is not a queued job. */
export function execOf(params: unknown): ExecState | null {
  const p = params && typeof params === 'object' && !Array.isArray(params) ? (params as Record<string, unknown>) : null;
  const e = p?._exec;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const x = e as Record<string, unknown>;
  if (typeof x.kind !== 'string' || typeof x.v !== 'number' || typeof x.attempt !== 'number' || typeof x.maxAttempts !== 'number') return null;
  return {
    kind: x.kind,
    v: x.v,
    attempt: x.attempt,
    maxAttempts: x.maxAttempts,
    owner: typeof x.owner === 'string' ? x.owner : null,
    leaseUntil: typeof x.leaseUntil === 'number' ? x.leaseUntil : null,
    ...(x.hold === 'billing' ? { hold: 'billing' as const } : {}),
    ...(x.owe === 'refund' ? { owe: 'refund' as const } : {}),
    ...(typeof x.lastError === 'string' ? { lastError: x.lastError } : {}),
  };
}

/** Is this generation_jobs row run by a lease worker? Then other reapers (drain-renders) leave it alone. */
export function isLeaseOwned(row: { params?: unknown }): boolean {
  return execOf(row.params) !== null;
}

const withExec = (row: LeaseRow, exec: ExecState): Record<string, unknown> => ({ ...row.params, _exec: exec });
const bump = (exec: ExecState, change: Partial<ExecState>): ExecState => {
  const next: ExecState = { ...exec, ...change, v: exec.v + 1 };
  if (change.owe === undefined && 'owe' in change) delete next.owe;
  if (change.hold === undefined && 'hold' in change) delete next.hold;
  return next;
};

/** Put a job on the queue. The insert is the idempotency check: a second enqueue of the same id answers 'exists'. */
export async function enqueue(
  store: LeaseStore,
  input: {
    id: string; userId: string; serviceType: ProduceKind; kind: string; params: Record<string, unknown>; maxAttempts?: number;
    /** Hold the row until release(): the caller still has to charge for it. */
    hold?: boolean;
  },
): Promise<'inserted' | 'exists' | 'error'> {
  const exec: ExecState = {
    kind: input.kind, v: 0, attempt: 0, maxAttempts: input.maxAttempts ?? MAX_ATTEMPTS, owner: null, leaseUntil: null,
    ...(input.hold ? { hold: 'billing' as const } : {}),
  };
  return store.insert({ id: input.id, userId: input.userId, serviceType: input.serviceType, params: { ...input.params, _exec: exec } });
}

/** Lift the billing hold: the charge landed, a worker may take the row. False when the row moved meanwhile (cancelled). */
export async function release(store: LeaseStore, id: string): Promise<boolean> {
  const row = await store.read(id);
  if (!row || !row.exec || row.status !== 'pending' || !row.exec.hold) return false;
  return store.cas(id, { v: row.exec.v, from: ['pending'] }, { params: withExec(row, bump(row.exec, { hold: undefined })) });
}

/** Fail a row that is still pending (its charge was refused). Never touches a row a worker holds. */
export async function failPending(store: LeaseStore, id: string, error: string): Promise<boolean> {
  const row = await store.read(id);
  if (!row || !row.exec || row.status !== 'pending') return false;
  const exec = bump(row.exec, { hold: undefined, lastError: error.slice(0, 120) });
  return store.cas(id, { v: row.exec.v, from: ['pending'] }, { status: 'failed', stage: 'failed', error: error.slice(0, 300), params: withExec(row, exec) });
}

/** Can a worker claim this row now? `pending`, or `processing` whose lease lapsed, with attempts left and no hold. */
export function claimable(row: LeaseRow, now: number): boolean {
  const e = row.exec;
  if (!e || e.hold || e.attempt >= e.maxAttempts) return false;
  if (row.status === 'pending') return true;
  return row.status === 'processing' && (e.leaseUntil ?? 0) <= now;
}

export type ClaimResult =
  | { ok: true; row: LeaseRow }
  | { ok: false; reason: 'missing' | 'final' | 'held' | 'leased' | 'exhausted' | 'raced' };

/** Take the lease on a row (a first run, or a retry of a run whose worker stopped renewing). */
export async function claim(store: LeaseStore, id: string, owner: string, now: number): Promise<ClaimResult> {
  const row = await store.read(id);
  if (!row || !row.exec) return { ok: false, reason: 'missing' };
  if (!LIVE.includes(row.status)) return { ok: false, reason: 'final' };
  if (row.exec.hold) return { ok: false, reason: 'held' };
  if (row.exec.attempt >= row.exec.maxAttempts) return { ok: false, reason: 'exhausted' };
  if (!claimable(row, now)) return { ok: false, reason: 'leased' };
  const exec = bump(row.exec, { attempt: row.exec.attempt + 1, owner, leaseUntil: now + LEASE_MS });
  const retry = row.exec.attempt > 0;
  const ok = await store.cas(id, { v: row.exec.v, from: LIVE }, {
    status: 'processing',
    stage: retry ? 'retrying' : 'starting',
    pct: retry ? row.pct : 2,
    params: withExec(row, exec),
  });
  return ok ? { ok: true, row: { ...row, status: 'processing', exec, params: withExec(row, exec) } } : { ok: false, reason: 'raced' };
}

export type Beat = 'held' | 'lost' | 'stopped';

/**
 * Renew the lease. 'stopped' = the row was failed under the worker (the owner cancelled, or the sweep gave it up);
 * 'lost' = another worker holds it now, or already delivered it (this one stalled past its lease). Either way the
 * worker must stop at once.
 */
export async function heartbeat(store: LeaseStore, id: string, owner: string, now: number): Promise<Beat> {
  for (let i = 0; i < 3; i += 1) {
    const row = await store.read(id);
    if (!row || !row.exec) return 'lost';
    if (row.status === 'failed') return 'stopped';
    if (row.status !== 'processing' || row.exec.owner !== owner) return 'lost';
    const exec = bump(row.exec, { leaseUntil: now + LEASE_MS });
    if (await store.cas(id, { v: row.exec.v, from: ['processing'] }, { params: withExec(row, exec) })) return 'held';
    // Lost the compare-and-set: something else changed _exec in between. Read again and decide.
  }
  return 'lost';
}

/** Move the row to a final state, only while `owner` still holds its lease. True when it moved. */
async function finish(
  store: LeaseStore,
  id: string,
  owner: string,
  write: Omit<LeaseWrite, 'params'> & { status: 'completed' | 'failed' },
  change: Partial<ExecState>,
): Promise<boolean> {
  for (let i = 0; i < 3; i += 1) {
    const row = await store.read(id);
    if (!row || !row.exec || row.status !== 'processing' || row.exec.owner !== owner) return false;
    const exec = bump(row.exec, { owner: null, leaseUntil: null, ...change });
    if (await store.cas(id, { v: row.exec.v, from: ['processing'] }, { ...write, params: withExec(row, exec) })) return true;
  }
  return false;
}

/** Deliver the row. `signedUrl` null keeps it out of the Library (lib/agent/media/audioExtract: filed only on the user's Save). */
export function complete(store: LeaseStore, id: string, owner: string, out: { signedUrl: string | null; result: Record<string, unknown> }): Promise<boolean> {
  return finish(store, id, owner, { status: 'completed', stage: 'completed', pct: 100, signedUrl: out.signedUrl, result: out.result, error: null }, {});
}

/** Fail the row the worker holds. `owe` records a refund still to pay in the same write. */
export function fail(store: LeaseStore, id: string, owner: string, error: string, owe: boolean): Promise<boolean> {
  return finish(store, id, owner, { status: 'failed', stage: 'failed', error: error.slice(0, 300) }, owe ? { owe: 'refund', lastError: error.slice(0, 120) } : { lastError: error.slice(0, 120) });
}

export type CancelResult = { ok: true; row: LeaseRow } | { ok: false; reason: 'missing' | 'not_owner' | 'final' };

/** The owner stops a queued or running job. The worker sees it on its next heartbeat and kills its render. */
export async function cancel(store: LeaseStore, id: string, userId: string, error: string, owe: boolean): Promise<CancelResult> {
  for (let i = 0; i < 3; i += 1) {
    const row = await store.read(id);
    if (!row || !row.exec) return { ok: false, reason: 'missing' };
    if (row.userId !== userId) return { ok: false, reason: 'not_owner' };
    if (!LIVE.includes(row.status)) return { ok: false, reason: 'final' };
    const exec = bump(row.exec, { hold: undefined, lastError: 'cancelled', ...(owe ? { owe: 'refund' as const } : {}) });
    if (await store.cas(id, { v: row.exec.v, from: LIVE }, { status: 'failed', stage: 'failed', error, params: withExec(row, exec) })) {
      return { ok: true, row: { ...row, status: 'failed', exec, params: withExec(row, exec) } };
    }
  }
  return { ok: false, reason: 'final' };
}

/** Clear a paid debt. Only after the effect landed; a lost clear just means the (idempotent) effect runs again. */
export async function settled(store: LeaseStore, id: string): Promise<boolean> {
  const row = await store.read(id);
  if (!row || !row.exec || !row.exec.owe) return false;
  const exec = bump(row.exec, { owe: undefined });
  return store.cas(id, { v: row.exec.v, from: ['failed', 'completed'] }, { params: withExec(row, exec) });
}

export interface ReapReport {
  /** Rows a worker may claim now (pending, or a lapsed lease with attempts left), oldest first. */
  runnable: string[];
  /** Rows failed here: their attempts ran out while no worker held them, or their billing hold was abandoned. */
  exhausted: LeaseRow[];
}

/**
 * The sweep's view of one kind: fail every row whose lease lapsed with no attempts left (owing a refund when it was
 * charged), and list what is ready for a worker.
 */
export async function reap(
  store: LeaseStore,
  kind: string,
  now: number,
  opts: { limit?: number; owesRefund: (row: LeaseRow) => boolean; error: string; abandonedError: string },
): Promise<ReapReport> {
  const rows = await store.listLive(kind, opts.limit ?? 25);
  const report: ReapReport = { runnable: [], exhausted: [] };
  for (const row of rows) {
    const e = row.exec;
    if (!e) continue;
    const lapsed = row.status === 'processing' && (e.leaseUntil ?? 0) <= now;
    const abandoned = row.status === 'pending' && e.hold && now - row.createdAt >= HOLD_MS;
    if ((lapsed && e.attempt >= e.maxAttempts) || abandoned) {
      const owe = opts.owesRefund(row);
      const exec = bump(e, {
        owner: null, leaseUntil: null, hold: undefined, ...(owe ? { owe: 'refund' as const } : {}),
        lastError: abandoned ? 'billing hold abandoned' : 'lease expired',
      });
      const ok = await store.cas(row.id, { v: e.v, from: [row.status] }, {
        status: 'failed', stage: 'failed', error: abandoned ? opts.abandonedError : opts.error, params: withExec(row, exec),
      });
      if (ok) report.exhausted.push({ ...row, status: 'failed', exec, params: withExec(row, exec) });
      continue;
    }
    if (claimable(row, now)) report.runnable.push(row.id);
  }
  return report;
}

// ── the live store: generation_jobs through the service role ──────────────────────────────────────────────────────

type Sb = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const COLS = 'id,user_id,status,current_stage,pct,params,result,signed_url,error,created_at';

/** A generation_jobs row (its column names) as a LeaseRow; null when it has no id or owner. */
export function leaseRowOf(d: Record<string, unknown>): LeaseRow | null {
  if (typeof d.id !== 'string' || typeof d.user_id !== 'string') return null;
  const params = d.params && typeof d.params === 'object' && !Array.isArray(d.params) ? (d.params as Record<string, unknown>) : {};
  const result = d.result && typeof d.result === 'object' && !Array.isArray(d.result) ? (d.result as Record<string, unknown>) : null;
  return {
    id: d.id,
    userId: d.user_id,
    status: d.status as JobStatus,
    stage: typeof d.current_stage === 'string' ? d.current_stage : null,
    pct: typeof d.pct === 'number' ? d.pct : 0,
    params,
    exec: execOf(params),
    createdAt: typeof d.created_at === 'string' ? Date.parse(d.created_at) || 0 : 0,
    error: typeof d.error === 'string' ? d.error : null,
    result,
    signedUrl: typeof d.signed_url === 'string' ? d.signed_url : null,
  };
}

/**
 * generation_jobs as a LeaseStore. Compare-and-set is a filtered PATCH: PostgREST applies the JSON-path filter
 * (params->_exec->>v) in the UPDATE's WHERE, so the check and the write are one statement, and `select('id')` says
 * whether a row matched. Errors are answered as "did not happen" (false / null / 'error'), never thrown.
 */
export function supabaseLeaseStore(client: () => Sb | null, report: (e: unknown, ctx: Record<string, unknown>) => void): LeaseStore {
  const TABLE = 'generation_jobs';
  const sb = (): Sb | null => {
    try { return client(); } catch { return null; }
  };
  const fields = (w: LeaseWrite): Record<string, unknown> => {
    const f: Record<string, unknown> = { params: w.params };
    if (w.status !== undefined) f.status = w.status;
    if (w.stage !== undefined) f.current_stage = w.stage;
    if (w.pct !== undefined) f.pct = Math.max(0, Math.min(100, Math.round(w.pct)));
    if (w.error !== undefined) f.error = w.error;
    if (w.result !== undefined) f.result = w.result;
    if (w.signedUrl !== undefined) f.signed_url = w.signedUrl;
    return f;
  };
  const list = async (fn: string, build: (q: any) => any): Promise<LeaseRow[]> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const c = sb();
    if (!c) return [];
    try {
      const { data, error } = await build(c.from(TABLE).select(COLS));
      if (error) { report(new Error(error.message), { fn }); return []; }
      return ((data ?? []) as Record<string, unknown>[]).map(leaseRowOf).filter((r): r is LeaseRow => r !== null);
    } catch (e) {
      report(e, { fn });
      return [];
    }
  };
  return {
    async insert(row) {
      const c = sb();
      if (!c) return 'error';
      try {
        const { error } = await c.from(TABLE).insert({
          id: row.id, user_id: row.userId, service_type: row.serviceType, status: 'pending', current_stage: 'queued', pct: 0, params: row.params,
        });
        if (!error) return 'inserted';
        if (error.code === '23505') return 'exists';
        report(new Error(error.message), { fn: 'lease.insert', id: row.id });
        return 'error';
      } catch (e) {
        report(e, { fn: 'lease.insert', id: row.id });
        return 'error';
      }
    },
    async read(id) {
      const c = sb();
      if (!c || !id) return null;
      try {
        const { data, error } = await c.from(TABLE).select(COLS).eq('id', id).maybeSingle();
        if (error || !data) return null;
        return leaseRowOf(data as Record<string, unknown>);
      } catch {
        return null;
      }
    },
    async cas(id, expect, write) {
      const c = sb();
      if (!c) return false;
      try {
        const { data, error } = await c.from(TABLE).update(fields(write))
          .eq('id', id)
          .eq('params->_exec->>v', String(expect.v))
          .in('status', [...expect.from])
          .select('id');
        if (error) { report(new Error(error.message), { fn: 'lease.cas', id }); return false; }
        return Array.isArray(data) && data.length > 0;
      } catch (e) {
        report(e, { fn: 'lease.cas', id });
        return false;
      }
    },
    async progress(id, owner, stage, pct) {
      const c = sb();
      if (!c) return false;
      try {
        const { data, error } = await c.from(TABLE).update({ current_stage: stage, pct: Math.max(0, Math.min(100, Math.round(pct))) })
          .eq('id', id)
          .eq('status', 'processing')
          .eq('params->_exec->>owner', owner)
          .select('id');
        return !error && Array.isArray(data) && data.length > 0;
      } catch {
        return false;
      }
    },
    listLive: (kind, limit) => list('lease.listLive', (q) => q.in('status', [...LIVE]).eq('params->_exec->>kind', kind).order('created_at', { ascending: true }).limit(limit)),
    listOwed: (kind, limit) => list('lease.listOwed', (q) => q.in('status', ['failed', 'completed']).eq('params->_exec->>kind', kind).eq('params->_exec->>owe', 'refund').limit(limit)),
  };
}
