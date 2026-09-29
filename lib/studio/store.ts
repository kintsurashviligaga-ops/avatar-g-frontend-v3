/**
 * Persistence for studio generation jobs (table `studio_jobs`, migration 20260929b).
 *
 * WHY A NEW TABLE and not columns on `generation_jobs` (the brief names that table): generation_jobs is
 * OWNER-WRITABLE — RLS lets a signed-in user insert and update their own rows, which the existing film
 * pipeline relies on — and money decisions must never read a field its user can write (that is exactly how
 * the render drainer could be made to mint credits; see 20260929a). It also has CHECK constraints
 * (service_type / status) that would have to be widened under live traffic. So billing state lives here,
 * written ONLY by service_role; a finished result is additionally filed into generation_jobs (service role)
 * so the existing Library shows it with no Library change.
 *
 * Every status change is a compare-and-set on the previous status, so a webhook, a poll and a user's cancel
 * racing on one job can never both "win" (and, e.g., both refund).
 */
import type { StudioService } from '@/lib/providers/types';

export type JobStatus =
  | 'reserving'      // row written, credits not yet taken
  | 'reserved'       // credits taken, not yet submitted
  | 'pending'        // waiting for a provider concurrency slot
  | 'submitting'     // the ONE generation POST is in flight
  | 'submit_unknown' // the POST timed out — the request may exist; reconciled by webhook/poll, never re-POSTed
  | 'queued'
  | 'in_progress'
  | 'finalizing'     // provider finished; copying outputs into our storage
  | 'completed'
  | 'failed'
  | 'nsfw'
  | 'canceled';

export const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>(['completed', 'failed', 'nsfw', 'canceled']);
/** Statuses in which the provider may be working on (or about to receive) the request. */
export const PROVIDER_ACTIVE_STATUSES: JobStatus[] = ['submitting', 'submit_unknown', 'queued', 'in_progress'];

export type RefundState = 'pending' | 'done' | 'nothing_to_refund';

/** Where a copied output lives in OUR storage. Signed on read — never a long-lived public URL. */
export interface StoredOutput {
  bucket: string;
  path: string;
  contentType: string;
}

export interface StudioJob {
  id: string;
  user_id: string;
  service: StudioService;
  model_id: string;
  provider: string;
  provider_endpoint: string;
  provider_request_id: string | null;
  status: JobStatus;
  input: Record<string, unknown>;
  prompt_original: string | null;
  estimate_provider_credits: number | null;
  estimate_usd: number | null;
  estimate_gel: number;
  charge_credits: number;
  charge_ref: string;
  charged_gel: number | null;
  refund_state: RefundState | null;
  refunded_credits: number;
  provider_output_urls: string[];
  output_urls: StoredOutput[];
  correlation_id: string | null;
  error_code: string | null;
  error_detail: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  next_poll_at: string | null;
}

export type NewStudioJob = Pick<
  StudioJob,
  | 'id' | 'user_id' | 'service' | 'model_id' | 'provider' | 'provider_endpoint' | 'input' | 'prompt_original'
  | 'estimate_provider_credits' | 'estimate_usd' | 'estimate_gel' | 'charge_credits' | 'charge_ref'
>;

export type JobPatch = Partial<Omit<StudioJob, 'id' | 'user_id' | 'charge_ref' | 'created_at'>>;

export interface StudioStore {
  insert(job: NewStudioJob): Promise<StudioJob>;
  get(id: string): Promise<StudioJob | null>;
  getForUser(id: string, userId: string): Promise<StudioJob | null>;
  byRequestId(requestId: string): Promise<StudioJob | null>;
  /** Compare-and-set: applies `patch` only when the current status is one of `from`. null = lost the race. */
  transition(id: string, from: JobStatus[], patch: JobPatch): Promise<StudioJob | null>;
  /** Non-status bookkeeping (refund results, reconciled request id…). */
  patch(id: string, patch: JobPatch): Promise<void>;
  listByStatus(statuses: JobStatus[], opts?: { updatedBefore?: string; dueBefore?: string; limit?: number }): Promise<StudioJob[]>;
  listRefundPending(limit?: number): Promise<StudioJob[]>;
  /** The user's most recent jobs, newest first — the studio's job list survives a reload. */
  listForUser(userId: string, limit?: number): Promise<StudioJob[]>;
  /** Webhook dedupe on (provider, request_id, status). true = first delivery. Throws if the write fails. */
  recordEvent(ev: { provider: string; requestId: string; status: string; jobId: string | null; payload: unknown }): Promise<boolean>;
}

/* ─── Supabase implementation (service role only) ─────────────────────────────────────────────── */

type Sb = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const TABLE = 'studio_jobs';
const EVENTS = 'provider_webhook_events';

export function createSupabaseStudioStore(sb: Sb): StudioStore {
  const one = async (q: Promise<{ data: unknown; error: { message: string } | null }>): Promise<StudioJob | null> => {
    const { data, error } = await q;
    if (error) throw new Error(`studio_jobs: ${error.message}`);
    return (data as StudioJob | null) ?? null;
  };

  return {
    async insert(job) {
      const r = await one(sb.from(TABLE).insert({ ...job, status: 'reserving' }).select('*').single());
      if (!r) throw new Error('studio_jobs: insert returned no row');
      return r;
    },
    get: (id) => one(sb.from(TABLE).select('*').eq('id', id).maybeSingle()),
    getForUser: (id, userId) => one(sb.from(TABLE).select('*').eq('id', id).eq('user_id', userId).maybeSingle()),
    byRequestId: (requestId) => one(sb.from(TABLE).select('*').eq('provider_request_id', requestId).maybeSingle()),
    transition: (id, from, patch) =>
      one(sb.from(TABLE).update(patch).eq('id', id).in('status', from).select('*').maybeSingle()),
    async patch(id, patch) {
      const { error } = await sb.from(TABLE).update(patch).eq('id', id);
      if (error) throw new Error(`studio_jobs: ${error.message}`);
    },
    async listByStatus(statuses, opts = {}) {
      let q = sb.from(TABLE).select('*').in('status', statuses);
      if (opts.updatedBefore) q = q.lt('updated_at', opts.updatedBefore);
      // Quoted: an ISO timestamp carries `.` and `:`, which PostgREST's or() grammar would otherwise parse.
      if (opts.dueBefore) q = q.or(`next_poll_at.is.null,next_poll_at.lte."${opts.dueBefore}"`);
      const { data, error } = await q.order('updated_at', { ascending: true }).limit(opts.limit ?? 25);
      if (error) throw new Error(`studio_jobs: ${error.message}`);
      return (data ?? []) as StudioJob[];
    },
    async listRefundPending(limit = 25) {
      const { data, error } = await sb.from(TABLE).select('*').eq('refund_state', 'pending').order('updated_at', { ascending: true }).limit(limit);
      if (error) throw new Error(`studio_jobs: ${error.message}`);
      return (data ?? []) as StudioJob[];
    },
    async listForUser(userId, limit = 12) {
      const { data, error } = await sb
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Math.min(limit, 50)));
      if (error) throw new Error(`studio_jobs: ${error.message}`);
      return (data ?? []) as StudioJob[];
    },
    async recordEvent(ev) {
      const { error } = await sb.from(EVENTS).insert({
        provider: ev.provider,
        request_id: ev.requestId,
        status: ev.status,
        job_id: ev.jobId,
        payload: ev.payload ?? null,
      });
      if (!error) return true;
      if ((error as { code?: string }).code === '23505') return false; // duplicate delivery
      throw new Error(`provider_webhook_events: ${error.message}`);
    },
  };
}
