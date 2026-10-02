/**
 * lib/research/types.ts — the Deep Research job model, shared by the server (store, service, routes), the Interactions
 * client's parser and the UI. Isomorphic: types and constants only, no imports from server code.
 *
 * A research job is ONE paid run of Google's Deep Research agent (Interactions API, background mode):
 *
 *   reserving → reserved → submitting → running → completed
 *                                   ↘ failed / canceled   (credits refunded exactly once, from the ledger)
 *
 *   reserving   the row is written, the credits are not yet taken
 *   reserved    the credits are taken; the provider has NOT been called (a stuck row is safe to resume)
 *   submitting  the ONE provider POST is in flight (never re-sent — an ambiguous outcome refunds instead)
 *   running     the provider accepted it and returned an interaction id; the cron sweeper (or a read) polls it
 *   completed   the report and its sources are stored on the row
 *   failed      refunded (or never charged); `error_code` says why
 *   canceled    the user stopped it (refunded)
 */

export type ResearchLocale = 'ka' | 'en' | 'ru';

export type ResearchStatus = 'reserving' | 'reserved' | 'submitting' | 'running' | 'completed' | 'failed' | 'canceled';

/** Statuses in which the job may still cost (or hold) money — the ones the caps count and the sweeper works. */
export const ACTIVE_RESEARCH_STATUSES: readonly ResearchStatus[] = ['reserving', 'reserved', 'submitting', 'running'];
export const TERMINAL_RESEARCH_STATUSES: readonly ResearchStatus[] = ['completed', 'failed', 'canceled'];

export const isActiveResearchStatus = (s: unknown): boolean => (ACTIVE_RESEARCH_STATUSES as readonly unknown[]).includes(s);
export const isTerminalResearchStatus = (s: unknown): boolean => (TERMINAL_RESEARCH_STATUSES as readonly unknown[]).includes(s);

export type RefundState = 'pending' | 'done' | 'nothing_to_refund';

/**
 * Why a job ended (or never started). Machine codes — the UI turns them into ka/en/ru copy; provider bodies never
 * reach a user (lib/api/providerError.ts), so a `provider_*` code is all the browser ever learns about a supplier fault.
 */
export type ResearchErrorCode =
  // refused before any money moved
  | 'insufficient_credits'
  | 'billing_unavailable'
  | 'too_many_active'
  | 'daily_limit'
  | 'capacity_reached'
  // the provider could not take or finish the job (refunded)
  | 'provider_unfunded'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'provider_rejected'
  | 'submit_ambiguous'
  | 'provider_failed'
  | 'provider_canceled'
  | 'provider_lost'
  | 'requires_action'
  | 'empty_report'
  | 'timeout'
  | 'stuck'
  // an attached document was deleted between the charge and the send of a resumed run
  | 'context_missing'
  // the user
  | 'user_canceled';

/** One cited web page (or file) behind the report. */
export interface ResearchSource {
  url: string;
  title?: string;
}

/** What the agent is doing right now, as far as the provider shows it (thinking summaries + search calls). */
export interface ResearchProgress {
  /** The newest thought summary, plain text, ≤ 240 chars. */
  summary?: string;
  /** Google Search queries issued so far. */
  searches?: number;
  /** Steps the interaction holds so far. */
  steps?: number;
  /** The newest search query. */
  lastQuery?: string;
}

/** A document the user attached from the Connectors view (metadata only — the text stays in research_context_files). */
export interface ResearchContextRef {
  id: string;
  name: string;
  chars: number;
}

/** The row as the store reads and writes it (table `research_jobs`, migration 20261003b). */
export interface ResearchJobRow {
  id: string;
  user_id: string;
  client_request_id: string | null;
  status: ResearchStatus;
  prompt: string;
  locale: ResearchLocale;
  context_files: ResearchContextRef[];
  context_chars: number;
  agent: string;
  charge_credits: number;
  charge_ref: string;
  /** false once the job is known to have cost nothing (it failed before the debit) — the caps count `counted` rows. */
  counted: boolean;
  refund_state: RefundState | null;
  refunded_credits: number;
  provider_interaction_id: string | null;
  provider_started_at: string | null;
  progress: ResearchProgress;
  report_md: string | null;
  /** Denormalised so the LIST never has to read the report or the sources. */
  report_chars: number;
  sources: ResearchSource[];
  sources_count: number;
  usage: Record<string, number>;
  incomplete: boolean;
  title: string | null;
  error_code: ResearchErrorCode | null;
  /** Internal diagnostics (never sent to a browser). */
  error_detail: string | null;
  cancel_requested: boolean;
  poll_failures: number;
  /** When a poller last took the job (the epoch until the first poll) — the compare-and-set that spaces provider polls. */
  last_polled_at: string;
  /** When the sweeper should poll it next. */
  next_poll_at: string;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
  reserved_at: string | null;
  completed_at: string | null;
  deadline_at: string;
}

/** The fields a store may change (everything but identity and the ledger ref). */
export type ResearchJobPatch = Partial<Omit<ResearchJobRow, 'id' | 'user_id' | 'charge_ref' | 'created_at'>>;

/**
 * What a browser may see of a job. No provider ids, no ledger ref, no internal error text.
 * `report` is present only on the single-job read (the list stays small); `hasReport` says whether it exists.
 */
export interface ResearchJobPublic {
  id: string;
  status: ResearchStatus;
  prompt: string;
  locale: ResearchLocale;
  title: string | null;
  credits: number;
  createdAt: string;
  /** When the provider accepted the job — the clock the UI counts elapsed time from. */
  startedAt: string | null;
  completedAt: string | null;
  progress: ResearchProgress;
  hasReport: boolean;
  reportChars: number;
  sourcesCount: number;
  incomplete: boolean;
  errorCode: ResearchErrorCode | null;
  /** The credits went back to the user (failure or cancel after the debit). */
  refunded: boolean;
  /** A refund is owed and on its way (the sweeper retries until the ledger confirms). */
  refundPending: boolean;
  cancelRequested: boolean;
  contextFiles: ResearchContextRef[];
  report?: string | null;
  sources?: ResearchSource[];
}

/** The routes' machine codes → HTTP statuses live in the routes; the UI reads `error` to pick its copy. */
export type ResearchStartCode =
  | 'auth_required'
  | 'unavailable'
  | 'invalid_request'
  | 'confirmation_required'
  | 'price_changed'
  | 'invalid_file'
  | ResearchErrorCode;
