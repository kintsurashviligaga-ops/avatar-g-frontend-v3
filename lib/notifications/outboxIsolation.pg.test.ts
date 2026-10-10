/** @jest-environment node */
/**
 * The delivery outbox's live store (lib/notifications/outboxLive supabaseOutboxStore) against a REAL but throwaway
 * database: a local Postgres 16 with Production's generation_jobs (its updated_at trigger included) behind a real
 * PostgREST (scripts/lease-isolation/run.sh). Every outlet is mocked; the point is that the JSON-path filters the
 * compare-and-set and the due list rely on (`params->_tell is null`, `params->_tell->>v = …`, `params->_tell->done is
 * null`, `params->_exec->>v = …`) mean in PostgREST what the in-memory store says they mean:
 *
 *   1. a finished queued job is told once on each outlet, and a second pass sends nothing;
 *   2. two deliverers at once still send each outlet once (the PATCH's WHERE decides, not a read);
 *   3. the lease queue's own write (a paid refund cleared, jobLease.settled) and ours cannot undo each other;
 *   4. the due list: fresh untold rows, open rows, never a run's step, never a row a browser could have written.
 *
 * Opt-in: runs only when LEASE_PG_REST_URL and LEASE_PG_JWT_SECRET point at this machine (run.sh sets them).
 */
import { createHmac } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

const REST = process.env.LEASE_PG_REST_URL ?? '';
const SECRET = process.env.LEASE_PG_JWT_SECRET ?? '';
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(REST);
const suite = REST && SECRET && local ? describe : describe.skip;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function serviceJwt(): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ role: 'service_role', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
const jwt = REST && SECRET ? serviceJwt() : '';
const db = new PostgrestClient(REST || 'http://127.0.0.1:1', { headers: { apikey: jwt, Authorization: `Bearer ${jwt}` } });

jest.mock('server-only', () => ({}));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => db }));

import { settled, supabaseLeaseStore } from '@/lib/orchestrator/jobLease';
import type { ChannelResult, NotifyEvent } from './types';
import { DEFAULT_PREFS, normalizePrefs } from './preferences';
import { deliver, sweepDeliveries, tellOf, type OutboxDeps, type Outlet } from './outbox';
import { supabaseOutboxStore } from './outboxLive';

const A = '0e000000-0000-4000-8000-00000000000a';
const errors: unknown[] = [];
const report = (e: unknown) => { errors.push(e); };
const store = supabaseOutboxStore(() => db as never, report);
const lease = supabaseLeaseStore(() => db as never, report);

function deps(sent: Array<{ outlet: Outlet; ev: NotifyEvent }>, opts: { slow?: number } = {}): OutboxDeps {
  const rec = (outlet: Outlet) => async (ev: NotifyEvent): Promise<ChannelResult> => {
    sent.push({ outlet, ev });
    if (opts.slow) await new Promise((r) => setTimeout(r, opts.slow));
    return { sent: true };
  };
  let n = 0;
  return {
    store,
    prefs: async () => normalizePrefs(DEFAULT_PREFS),
    send: { bell: rec('bell'), push: rec('push'), whatsapp: rec('whatsapp') },
    firstNotice: async () => true,
    now: () => Date.now(),
    newId: () => `pg-${process.pid}-${(n += 1)}`,
  };
}

const exec = (v: number, extra: Record<string, unknown> = {}) => ({ kind: 'agent-montage', v, attempt: 1, maxAttempts: 2, owner: null, leaseUntil: null, ...extra });

async function insert(id: string, status: string, params: Record<string, unknown>): Promise<void> {
  const { error } = await db.from('generation_jobs').insert({ id, user_id: A, service_type: 'film', status, current_stage: status, pct: 100, params });
  if (error) throw new Error(error.message);
}
async function paramsOf(id: string): Promise<Record<string, unknown>> {
  const { data } = await db.from('generation_jobs').select('params,status').eq('id', id).single();
  return (data as { params: Record<string, unknown> }).params;
}

suite('delivery outbox on a real Postgres + PostgREST (local, isolated)', () => {
  jest.setTimeout(30_000);

  beforeEach(async () => {
    errors.length = 0;
    await db.from('generation_jobs').delete().eq('user_id', A);
  });

  it('1. a finished queued job is told once on each outlet; a second pass sends nothing', async () => {
    await insert('ob-1', 'completed', { _exec: exec(4) });
    const sent: Array<{ outlet: Outlet; ev: NotifyEvent }> = [];
    expect((await deliver(deps(sent), 'ob-1')).outcome).toBe('delivered');
    expect(sent.map((s) => s.outlet)).toEqual(['bell', 'push', 'whatsapp']);
    const p = await paramsOf('ob-1');
    expect(tellOf(p)).toMatchObject({ done: true, event: 'task_completed' });
    expect((p._exec as { v: number }).v).toBe(6); // the claim and the result each moved the lease version
    expect((await deliver(deps(sent), 'ob-1')).outcome).toBe('done');
    expect(sent).toHaveLength(3);
    expect(errors).toEqual([]);
  });

  it('2. two deliverers at once: each outlet once', async () => {
    await insert('ob-2', 'completed', { _exec: exec(1) });
    const sent: Array<{ outlet: Outlet; ev: NotifyEvent }> = [];
    const d = deps(sent, { slow: 100 });
    const r = await Promise.all([deliver(d, 'ob-2'), deliver(d, 'ob-2'), deliver(d, 'ob-2')]);
    expect(sent.map((s) => s.outlet).sort()).toEqual(['bell', 'push', 'whatsapp']);
    expect(r.filter((x) => x.outcome === 'delivered')).toHaveLength(1);
    expect(tellOf(await paramsOf('ob-2'))!.done).toBe(true);
  });

  it('3. the lease queue clears a paid refund after our record: neither write undoes the other', async () => {
    await insert('ob-3', 'failed', { _exec: exec(2, { owe: 'refund', lastError: 'render failed' }), _reserve: { ref: 'r', credits: 3 } });
    // The lease sweep read the row first (v2) …
    const before = await lease.read('ob-3');
    expect(before?.exec?.owe).toBe('refund');
    const sent: Array<{ outlet: Outlet; ev: NotifyEvent }> = [];
    expect((await deliver(deps(sent), 'ob-3')).outcome).toBe('delivered');
    expect(sent.map((s) => s.outlet)).toEqual(['bell', 'push']); // a failure: bell and push only
    // … then clears the refund on what it read: its compare-and-set loses (our writes moved _exec.v), so the refund
    // stays owed and the sweep pays it again (the ledger dedupes it by its ref); our record is intact.
    const stale = await lease.cas('ob-3', { v: before!.exec!.v, from: ['failed'] }, { params: { ...before!.params, _exec: { ...before!.exec, v: before!.exec!.v + 1, owe: undefined } } });
    expect(stale).toBe(false);
    expect(tellOf(await paramsOf('ob-3'))!.done).toBe(true);
    // The fresh settle lands and keeps our record.
    expect(await settled(lease, 'ob-3')).toBe(true);
    const p = await paramsOf('ob-3');
    expect((p._exec as Record<string, unknown>).owe).toBeUndefined();
    expect(tellOf(p)!.done).toBe(true);
  });

  it('4. the due list: fresh untold and open rows; never a step, a live row or a browser-written row', async () => {
    await insert('ob-fresh', 'completed', { _exec: exec(1) });
    await insert('ob-step', 'completed', { _exec: exec(1), _parent: 'ob-run' });
    await insert('ob-live', 'processing', { _exec: exec(1) });
    await insert('ob-browser', 'completed', { prompt: 'x' });
    await insert('ob-open', 'completed', { _exec: exec(3), _tell: { v: 2, event: 'task_completed', at: Date.now(), out: { bell: { s: 'sent', n: 1, at: Date.now() }, push: { s: 'sent', n: 1, at: Date.now() }, whatsapp: { s: 'retry', n: 1, at: 0, r: 'failed' } } } });
    await insert('ob-done', 'completed', { _exec: exec(3), _tell: { v: 2, event: 'task_completed', at: Date.now(), out: {}, done: true } });
    const due = (await store.listDue(Date.now(), 50)).map((r) => r.id).sort();
    expect(due).toEqual(['ob-browser', 'ob-fresh', 'ob-open']); // the browser row is listed but never told (noticeOf)
    const sent: Array<{ outlet: Outlet; ev: NotifyEvent }> = [];
    const r = await sweepDeliveries(deps(sent));
    expect(r.outcomes).toEqual({ delivered: 2, not_eligible: 1 });
    // ob-fresh: bell, push, WhatsApp; ob-open: only its WhatsApp retry.
    expect(sent.map((s) => s.outlet).sort()).toEqual(['bell', 'push', 'whatsapp', 'whatsapp']);
    expect((await store.listDue(Date.now(), 50)).map((x) => x.id)).toEqual(['ob-browser']);
    expect(errors).toEqual([]);
  });
});
