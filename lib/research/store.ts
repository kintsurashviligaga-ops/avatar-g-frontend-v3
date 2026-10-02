/**
 * lib/research/store.ts — persistence for research jobs (table `research_jobs`, migration 20261003b).
 *
 * WRITTEN ONLY BY service_role (RLS: the owner may SELECT their own rows, nobody else may do anything; the table's
 * privileges are revoked from anon and authenticated). The job row carries the ledger ref, the refund state and the
 * report, so — like `studio_jobs` — no browser may write a field a money decision reads (see 20260929a).
 *
 * Every status change is a COMPARE-AND-SET on the previous status: a user's cancel, a read-through refresh and the cron
 * sweeper racing on one job can never both "win" (and, e.g., both refund, or both file the notification).
 *
 * supabase-js ANSWERS `{ error }` instead of throwing, so every method here turns a failed query into a thrown Error —
 * the service decides what that means for money (always: fail closed). The one exception is `insert`, which reports a
 * duplicate idempotency key as a value, because a duplicate is an answer ("this request already started"), not a fault.
 */
import type { ResearchJobPatch, ResearchJobRow, ResearchStatus } from './types';

export type NewResearchJob = Pick<
  ResearchJobRow,
  'id' | 'user_id' | 'client_request_id' | 'prompt' | 'locale' | 'context_files' | 'context_chars' | 'agent' | 'charge_credits' | 'charge_ref' | 'deadline_at'
>;

export type InsertResult = { ok: true; row: ResearchJobRow } | { ok: false; duplicate: true };

export interface ResearchStore {
  insert(job: NewResearchJob, nowIso: string): Promise<InsertResult>;
  get(id: string): Promise<ResearchJobRow | null>;
  getForUser(id: string, userId: string): Promise<ResearchJobRow | null>;
  findByRequestId(userId: string, requestId: string): Promise<ResearchJobRow | null>;
  /** Compare-and-set: applies `patch` only when the current status is one of `from`. null = lost the race. */
  transition(id: string, from: ResearchStatus[], patch: ResearchJobPatch): Promise<ResearchJobRow | null>;
  /** Non-status bookkeeping (progress, poll counters, refund results). */
  patch(id: string, patch: ResearchJobPatch): Promise<void>;
  /** Stamp last_polled_at when the previous stamp is not newer than `cutoffIso`. true = this caller owns the poll. */
  claimPoll(id: string, cutoffIso: string, nowIso: string): Promise<boolean>;
  /** Stamp notified_at once. true = this caller is the first and files the notification. */
  markNotified(id: string, nowIso: string): Promise<boolean>;
  /** Running jobs whose next_poll_at has passed, oldest first. */
  listDue(nowIso: string, limit: number): Promise<ResearchJobRow[]>;
  /** Jobs in `statuses` untouched since `updatedBeforeIso` (a crash left them there). */
  listStuck(statuses: ResearchStatus[], updatedBeforeIso: string, limit: number): Promise<ResearchJobRow[]>;
  listRefundPending(limit: number): Promise<ResearchJobRow[]>;
  /** The user's newest jobs WITHOUT their report or sources (the list stays small). */
  listForUser(userId: string, limit: number): Promise<ResearchJobRow[]>;
  /** Jobs that cost (or may cost) money, created since `sinceIso` — for the daily caps. Throws when it cannot count. */
  countCountedSince(sinceIso: string, userId?: string): Promise<number>;
  /** The user's jobs still holding or spending money (reserving … running). Throws when it cannot count. */
  countActive(userId: string): Promise<number>;
}

type Sb = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const TABLE = 'research_jobs';

/**
 * Everything the LIST needs. ⚠️ NEVER `report_md`, `sources`, `usage`, `error_detail`, `provider_interaction_id` or
 * `charge_ref`: a listing of 20 jobs must not drag 20 reports (up to 400 KB each) over the wire, and the browser has no
 * business with the provider's id or the ledger ref. Those columns are simply not selected.
 */
const LIGHT_COLUMNS = [
  'id', 'user_id', 'client_request_id', 'status', 'prompt', 'locale', 'title', 'context_files', 'context_chars', 'agent', 'charge_credits',
  'counted', 'refund_state', 'refunded_credits', 'provider_started_at', 'progress', 'report_chars', 'sources_count', 'incomplete', 'error_code',
  'cancel_requested', 'poll_failures', 'last_polled_at', 'next_poll_at', 'notified_at', 'created_at', 'updated_at', 'reserved_at', 'completed_at',
  'deadline_at',
].join(',');

/** The row a list read returns: the unselected heavy columns carry their empty values, so the type stays whole. */
function lightRow(r: Record<string, unknown>): ResearchJobRow {
  return { report_md: null, sources: [], usage: {}, error_detail: null, provider_interaction_id: null, charge_ref: '', ...r } as unknown as ResearchJobRow;
}

export function createSupabaseResearchStore(sb: Sb): ResearchStore {
  const fail = (what: string, error: { message: string }): never => {
    throw new Error(`research_jobs ${what}: ${error.message}`);
  };

  const one = async (q: Promise<{ data: unknown; error: { message: string } | null }>, what: string): Promise<ResearchJobRow | null> => {
    const { data, error } = await q;
    if (error) return fail(what, error);
    return (data as ResearchJobRow | null) ?? null;
  };

  const many = async (q: Promise<{ data: unknown; error: { message: string } | null }>, what: string, light = false): Promise<ResearchJobRow[]> => {
    const { data, error } = await q;
    if (error) return fail(what, error);
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    return light ? rows.map(lightRow) : (rows as unknown as ResearchJobRow[]);
  };

  const count = async (q: Promise<{ count?: number | null; error: { message: string } | null }>, what: string): Promise<number> => {
    const { count: n, error } = await q;
    if (error) return fail(what, error);
    if (typeof n !== 'number') return fail(what, { message: 'no count returned' });
    return n;
  };

  return {
    async insert(job, nowIso) {
      const row: ResearchJobRow = {
        ...job,
        status: 'reserving',
        counted: true,
        refund_state: null,
        refunded_credits: 0,
        provider_interaction_id: null,
        provider_started_at: null,
        progress: {},
        report_md: null,
        report_chars: 0,
        sources: [],
        sources_count: 0,
        usage: {},
        incomplete: false,
        title: null,
        error_code: null,
        error_detail: null,
        cancel_requested: false,
        poll_failures: 0,
        last_polled_at: new Date(0).toISOString(),
        next_poll_at: nowIso,
        notified_at: null,
        created_at: nowIso,
        updated_at: nowIso,
        reserved_at: null,
        completed_at: null,
      };
      const { data, error } = await sb.from(TABLE).insert(row).select('*').single();
      if (error) {
        if ((error as { code?: string }).code === '23505' && job.client_request_id) return { ok: false, duplicate: true };
        return fail('insert', error);
      }
      return { ok: true, row: (data as ResearchJobRow) ?? row };
    },

    get: (id) => one(sb.from(TABLE).select('*').eq('id', id).maybeSingle(), 'get'),
    getForUser: (id, userId) => one(sb.from(TABLE).select('*').eq('id', id).eq('user_id', userId).maybeSingle(), 'getForUser'),
    findByRequestId: (userId, requestId) =>
      one(sb.from(TABLE).select('*').eq('user_id', userId).eq('client_request_id', requestId).maybeSingle(), 'findByRequestId'),

    transition: (id, from, patch) => one(sb.from(TABLE).update(patch).eq('id', id).in('status', from).select('*').maybeSingle(), 'transition'),

    async patch(id, patch) {
      const { error } = await sb.from(TABLE).update(patch).eq('id', id);
      if (error) fail('patch', error);
    },

    async claimPoll(id, cutoffIso, nowIso) {
      const { data, error } = await sb
        .from(TABLE)
        .update({ last_polled_at: nowIso })
        .eq('id', id)
        .eq('status', 'running')
        .lte('last_polled_at', cutoffIso)
        .select('id')
        .maybeSingle();
      if (error) return fail('claimPoll', error);
      return !!data;
    },

    async markNotified(id, nowIso) {
      const { data, error } = await sb.from(TABLE).update({ notified_at: nowIso }).eq('id', id).is('notified_at', null).select('id').maybeSingle();
      if (error) return fail('markNotified', error);
      return !!data;
    },

    listDue: (nowIso, limit) =>
      many(sb.from(TABLE).select('*').eq('status', 'running').lte('next_poll_at', nowIso).order('next_poll_at', { ascending: true }).limit(limit), 'listDue'),

    listStuck: (statuses, updatedBeforeIso, limit) =>
      many(sb.from(TABLE).select('*').in('status', statuses).lt('updated_at', updatedBeforeIso).order('updated_at', { ascending: true }).limit(limit), 'listStuck'),

    listRefundPending: (limit) =>
      many(sb.from(TABLE).select('*').eq('refund_state', 'pending').order('updated_at', { ascending: true }).limit(limit), 'listRefundPending'),

    listForUser: (userId, limit) =>
      many(
        sb.from(TABLE).select(LIGHT_COLUMNS).eq('user_id', userId).order('created_at', { ascending: false }).limit(Math.max(1, Math.min(limit, 50))),
        'listForUser',
        true,
      ),

    countCountedSince(sinceIso, userId) {
      let q = sb.from(TABLE).select('id', { count: 'exact', head: true }).eq('counted', true).gte('created_at', sinceIso);
      if (userId) q = q.eq('user_id', userId);
      return count(q, 'countCountedSince');
    },

    countActive: (userId) =>
      count(
        sb.from(TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['reserving', 'reserved', 'submitting', 'running']),
        'countActive',
      ),
  };
}
