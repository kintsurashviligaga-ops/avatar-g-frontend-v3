/**
 * lib/research/service.ts — the Deep Research billing saga. Pure orchestration over INJECTED dependencies (store, ledger,
 * provider client, notifier — lib/research/runtime.ts wires the real ones), so every path below, including the ugly
 * ones, is unit-tested with fakes and no network.
 *
 *   price ──▶ the user CONFIRMED that exact number ──▶ row written ──▶ caps ──▶ RESERVE credits (ledger)
 *        ──▶ ONE provider POST ──▶ running ──▶ polled (cron sweeper / read-through) ──▶ completed: report stored, notified
 *                                          └─▶ failed / canceled / timed out: refunded from the LEDGER, exactly once
 *
 * MONEY RULES (each one is a test in service.test.ts):
 *  1. The credits are taken BEFORE the provider is called, and the provider is never called when the reserve did not
 *     succeed — "skipped" (the RPC absent) and "error" (a lost answer) fail closed exactly like "insufficient".
 *  2. The number the user saw is the number charged: a request whose `confirmedCredits` differs from researchCredits() is
 *     refused (409 price_changed) BEFORE anything is written.
 *  3. The start POST is sent AT MOST ONCE. Anything doubtful (timeout, 5xx, no id) refunds instead of re-sending.
 *  4. A refund pays back what the LEDGER shows was taken under the job's ref (`refundByRef`), never an amount read from a
 *     row, and its ref is idempotent — so a webhook-less world (cron + read-through + cancel racing) can refund once.
 *  5. Every status change is a compare-and-set, so only one racer owns each transition (and each refund, and the one
 *     notification).
 *  6. Fail closed on every ambiguity: an uncountable cap, an unreadable ledger, a store error — nothing starts.
 *  7. A job that cannot finish by its deadline is cancelled at the provider (best effort) and refunded.
 */
import { providerErrorBody, type ProviderFailure } from '@/lib/api/providerError';
import { buildResearchInput, foldedContextChars, type ResearchContextFile } from './context';
import type { InteractionsClient } from './interactionsClient';
import { researchLimits, utcDayStart, type ResearchLimits } from './limits';
import { deriveTitle, type ParsedInteraction } from './parse';
import { researchCredits } from './pricing';
import type { ResearchStore } from './store';
import type {
  ResearchErrorCode,
  ResearchJobPatch,
  ResearchJobRow,
  ResearchLocale,
  ResearchStartCode,
  ResearchStatus,
} from './types';
import { isTerminalResearchStatus } from './types';

export interface LedgerPort {
  deduct(userId: string, credits: number, ref: string): Promise<{ ok: boolean; reason?: string }>;
  /** Pays back the NET amount debited under `ref` (capped at `claimed`) as `${ref}:refund`. */
  refundByRef(userId: string, ref: string, claimed?: number): Promise<{ ok: boolean; refunded: number; reason?: string }>;
}

export interface ContextFilesPort {
  /** The user's OWN documents for one run, in the order asked. `invalid_file` when an id is not theirs / not there. */
  loadForRun(userId: string, ids: string[]): Promise<{ ok: true; files: ResearchContextFile[] } | { ok: false; code: 'invalid_file' | 'unavailable' }>;
}

export interface ResearchDeps {
  store: ResearchStore;
  client: InteractionsClient;
  ledger: LedgerPort;
  files: ContextFilesPort;
  /** Files the in-app notification (best effort, once per job). */
  notify(job: ResearchJobRow, outcome: 'completed' | 'failed'): Promise<void>;
  /** An ops signal (log-based alert + Sentry) — never reaches a user. */
  alert(marker: string, data: Record<string, unknown>): void;
  now(): number;
  newId(): string;
  limits?(): ResearchLimits;
}

export interface StartRequest {
  userId: string;
  prompt: string;
  locale: ResearchLocale;
  fileIds?: string[];
  /** The price the user saw on the button. Anything but researchCredits() is refused. */
  confirmedCredits: number | null | undefined;
  /** Idempotency key: a replay returns the same job instead of charging again. */
  requestId?: string | null;
}

export type StartResult =
  | { ok: true; job: ResearchJobRow; replayed: boolean }
  | { ok: false; code: ResearchStartCode; credits?: number; /** a provider-side class, for lib/api/providerError copy */ providerFailure?: ProviderFailure };

export type CancelResult =
  | { ok: true; job: ResearchJobRow }
  | { ok: false; code: 'not_found' | 'too_early' | 'unavailable' };

export interface SweepReport {
  stuckReserving: number;
  resumed: number;
  stuckSubmitting: number;
  polled: number;
  completed: number;
  failed: number;
  refundsRetried: number;
  errors: number;
}

// ─── timing ──────────────────────────────────────────────────────────────────
/** A `reserving` row older than this lost its worker between the insert and the debit. */
export const RESERVING_STUCK_MS = 5 * 60_000;
/** A `reserved` row older than this was charged but never sent — safe to resume (the POST CAS makes it once-only). */
export const RESERVED_STUCK_MS = 60_000;
/** A `submitting` row older than this had its worker die MID-POST: ambiguous, so refunded, never re-sent. */
export const SUBMITTING_STUCK_MS = 2 * 60_000;
/** The sweeper polls a running job about this often (cron ticks are a minute apart; a 40 s gap is never missed by a tick). */
export const POLL_EVERY_MS = 40_000;
/** Two pollers (a read and the sweeper) never hit the provider for one job closer together than this. */
export const MIN_POLL_GAP_MS = 8_000;
/** A 404 from the provider this soon after the start may be propagation lag — wait before calling the job lost. */
export const NOT_FOUND_GRACE_MS = 2 * 60_000;
/** Reports longer than this are cut (a 400 KB report is already ~70k words). */
export const MAX_REPORT_CHARS = 400_000;

const iso = (ms: number) => new Date(ms).toISOString();

const PROVIDER_CODE: Record<ProviderFailure | 'not_configured', ResearchErrorCode> = {
  provider_unfunded: 'provider_unfunded',
  provider_rate_limited: 'provider_rate_limited',
  provider_unavailable: 'provider_unavailable',
  provider_rejected: 'provider_rejected',
  not_configured: 'provider_unavailable',
};

export function createResearchService(deps: ResearchDeps) {
  const limits = () => deps.limits?.() ?? researchLimits();

  // ── refunds ────────────────────────────────────────────────────────────────

  /**
   * Terminal failure + refund. The refund is the ledger's NET debit under the job's ref capped at what the job charged —
   * a job whose credits were never taken refunds nothing, and a second call refunds nothing more.
   */
  async function failAndRefund(
    job: ResearchJobRow,
    to: 'failed' | 'canceled',
    code: ResearchErrorCode,
    detail: string | null,
    from: ResearchStatus[],
    extra: ResearchJobPatch = {},
  ): Promise<ResearchJobRow | null> {
    const t = await deps.store.transition(job.id, from, {
      status: to,
      error_code: code,
      error_detail: detail ? detail.slice(0, 500) : null,
      completed_at: iso(deps.now()),
      refund_state: 'pending',
      ...extra,
    });
    if (!t) return null; // someone else already moved it — they own the refund
    await settleRefund(t);
    return (await deps.store.get(t.id)) ?? t;
  }

  async function settleRefund(job: ResearchJobRow): Promise<void> {
    const r = await deps.ledger
      .refundByRef(job.user_id, job.charge_ref, job.charge_credits)
      .catch(() => ({ ok: false, refunded: 0, reason: 'error' }));
    try {
      if (r.ok) await deps.store.patch(job.id, { refund_state: 'done', refunded_credits: r.refunded });
      else if (r.reason === 'skipped') await deps.store.patch(job.id, { refund_state: 'nothing_to_refund', refunded_credits: 0 });
      else deps.alert('research_refund_failed', { jobId: job.id, ref: job.charge_ref }); // stays 'pending' → the sweeper retries
    } catch {
      deps.alert('research_refund_unrecorded', { jobId: job.id, ref: job.charge_ref });
    }
  }

  /** A failure BEFORE any debit (a cap, a refused reserve): nothing to refund, and the job stops counting toward the caps. */
  async function failBeforeDebit(job: ResearchJobRow, code: ResearchErrorCode): Promise<void> {
    await deps.store
      .transition(job.id, ['reserving'], { status: 'failed', counted: false, error_code: code, completed_at: iso(deps.now()), refund_state: 'nothing_to_refund' })
      .catch(() => null);
  }

  async function notifyOnce(job: ResearchJobRow, outcome: 'completed' | 'failed'): Promise<void> {
    try {
      if (await deps.store.markNotified(job.id, iso(deps.now()))) await deps.notify(job, outcome);
    } catch {
      /* a notification is best effort; the UI reads the job list on its own */
    }
  }

  // ── start ──────────────────────────────────────────────────────────────────

  async function start(req: StartRequest): Promise<StartResult> {
    const price = researchCredits();
    if (req.confirmedCredits === undefined || req.confirmedCredits === null) return { ok: false, code: 'confirmation_required', credits: price };
    if (req.confirmedCredits !== price) return { ok: false, code: 'price_changed', credits: price };

    const lim = limits();
    if (!lim.enabled || lim.globalDaily <= 0) return { ok: false, code: 'unavailable' };

    const requestId = typeof req.requestId === 'string' && req.requestId.trim() ? req.requestId.trim().slice(0, 100) : null;
    try {
      if (requestId) {
        const existing = await deps.store.findByRequestId(req.userId, requestId);
        if (existing) return { ok: true, job: existing, replayed: true };
      }
    } catch (e) {
      deps.alert('research_start_store_unreadable', { stage: 'replay', error: msg(e) });
      return { ok: false, code: 'unavailable' };
    }

    let files: ResearchContextFile[] = [];
    const fileIds = [...new Set(req.fileIds ?? [])];
    if (fileIds.length > 0) {
      const loaded = await deps.files.loadForRun(req.userId, fileIds).catch(() => ({ ok: false as const, code: 'unavailable' as const }));
      if (!loaded.ok) return { ok: false, code: loaded.code };
      files = loaded.files;
    }

    const id = deps.newId();
    const nowMs = deps.now();
    let job: ResearchJobRow;
    try {
      const ins = await deps.store.insert(
        {
          id,
          user_id: req.userId,
          client_request_id: requestId,
          prompt: req.prompt,
          locale: req.locale,
          context_files: files.map((f) => ({ id: f.id, name: f.name, chars: f.text.length })),
          context_chars: foldedContextChars(files),
          agent: lim.agent,
          charge_credits: price,
          charge_ref: `research:${id}`,
          deadline_at: iso(nowMs + lim.deadlineMs),
        },
        iso(nowMs),
      );
      if (!ins.ok) {
        // A concurrent request with the same key won the insert: that IS this request.
        const winner = requestId ? await deps.store.findByRequestId(req.userId, requestId) : null;
        return winner ? { ok: true, job: winner, replayed: true } : { ok: false, code: 'unavailable' };
      }
      job = ins.row;
    } catch (e) {
      deps.alert('research_start_store_unreadable', { stage: 'insert', error: msg(e) });
      return { ok: false, code: 'unavailable' };
    }

    // Caps — counted AFTER the row exists, so two concurrent starts can only over-reject. Fail closed when uncountable.
    try {
      const dayStart = utcDayStart(nowMs);
      const [active, userToday, globalToday] = await Promise.all([
        deps.store.countActive(req.userId),
        deps.store.countCountedSince(dayStart, req.userId),
        deps.store.countCountedSince(dayStart),
      ]);
      const refused: ResearchErrorCode | null =
        active > lim.maxActive ? 'too_many_active' : userToday > lim.userDaily ? 'daily_limit' : globalToday > lim.globalDaily ? 'capacity_reached' : null;
      if (refused) {
        await failBeforeDebit(job, refused);
        return { ok: false, code: refused };
      }
    } catch (e) {
      deps.alert('research_start_store_unreadable', { stage: 'caps', error: msg(e) });
      await failBeforeDebit(job, 'billing_unavailable');
      return { ok: false, code: 'unavailable' };
    }

    // RESERVE. Nothing below this line runs unless the ledger answered ok.
    const debit = await deps.ledger.deduct(req.userId, price, job.charge_ref).catch(() => ({ ok: false, reason: 'error' }));
    if (!debit.ok) {
      const code: ResearchErrorCode = debit.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable';
      // 'error' can mean "the debit committed and the answer was lost" — refundByRef pays back only what the ledger shows.
      if (code === 'billing_unavailable') await deps.ledger.refundByRef(req.userId, job.charge_ref, price).catch(() => undefined);
      await failBeforeDebit(job, code);
      return { ok: false, code, credits: price };
    }
    let reserved: ResearchJobRow | null = null;
    try {
      reserved = await deps.store.transition(job.id, ['reserving'], { status: 'reserved', reserved_at: iso(deps.now()) });
    } catch (e) {
      deps.alert('research_reserve_unrecorded', { jobId: job.id, error: msg(e) }); // the sweeper's stuck-reserving refund covers it
    }
    if (!reserved) return { ok: true, job: (await deps.store.get(job.id).catch(() => null)) ?? job, replayed: false };

    const submitted = await submit(reserved, files);
    if (submitted.ok) return { ok: true, job: submitted.job, replayed: false };
    return { ok: false, code: submitted.code, providerFailure: submitted.failure };
  }

  /** The ONE provider POST for a reserved job. Returns the running job, or the failure that refunded it. */
  async function submit(
    job: ResearchJobRow,
    knownFiles?: ResearchContextFile[],
  ): Promise<{ ok: true; job: ResearchJobRow } | { ok: false; code: ResearchErrorCode; failure: ProviderFailure }> {
    // The owner's documents, for a job the sweeper resumes (a fresh start already has them).
    let files = knownFiles;
    if (!files) {
      const ids = job.context_files.map((f) => f.id);
      files = [];
      if (ids.length > 0) {
        const loaded = await deps.files.loadForRun(job.user_id, ids).catch(() => ({ ok: false as const, code: 'unavailable' as const }));
        // The store could not be read: leave the job `reserved` — the next sweep tries again.
        if (!loaded.ok && loaded.code === 'unavailable') return { ok: true, job };
        // A document the user paid to include is gone: running without it would change what was bought. Refund instead.
        if (!loaded.ok) {
          await failAndRefund(job, 'failed', 'context_missing', 'an attached document no longer exists', ['reserved']);
          return { ok: false, code: 'context_missing', failure: 'provider_rejected' };
        }
        files = loaded.files;
      }
    }

    const sending = await deps.store.transition(job.id, ['reserved'], { status: 'submitting' });
    if (!sending) {
      const cur = (await deps.store.get(job.id).catch(() => null)) ?? job;
      return { ok: true, job: cur }; // another worker owns this submit
    }

    const out = await deps.client.start({
      agent: sending.agent,
      input: buildResearchInput({ prompt: sending.prompt, locale: sending.locale, files }),
    });

    if (out.ok) {
      const nowMs = deps.now();
      const running = await deps.store
        .transition(sending.id, ['submitting'], {
          status: 'running',
          provider_interaction_id: out.id,
          provider_started_at: iso(nowMs),
          last_polled_at: iso(nowMs),
          next_poll_at: iso(nowMs + POLL_EVERY_MS),
        })
        .catch(() => null);
      if (running) return { ok: true, job: running };
      // The provider accepted it but the row moved (a sweeper called it stuck). Keep the id for the record.
      await deps.store.patch(sending.id, { provider_interaction_id: out.id }).catch(() => undefined);
      deps.alert('research_start_unrecorded', { jobId: sending.id });
      return { ok: true, job: (await deps.store.get(sending.id).catch(() => null)) ?? sending };
    }

    const code: ResearchErrorCode = out.ambiguous ? 'submit_ambiguous' : PROVIDER_CODE[out.failure];
    if (out.ambiguous) deps.alert('research_submit_ambiguous', { jobId: sending.id, status: out.status ?? null }); // an orphan run may exist
    else if (out.failure === 'provider_unfunded') deps.alert('research_provider_unfunded', { jobId: sending.id });
    await failAndRefund(sending, 'failed', code, out.detail, ['submitting']);
    return { ok: false, code, failure: out.failure === 'not_configured' ? 'provider_unavailable' : out.failure };
  }

  // ── polling ────────────────────────────────────────────────────────────────

  /** Cancel at the provider, best effort, then refund as `code`. */
  async function timeoutJob(job: ResearchJobRow, code: ResearchErrorCode): Promise<ResearchJobRow> {
    if (job.provider_interaction_id) await deps.client.cancel(job.provider_interaction_id).catch(() => undefined);
    deps.alert('research_job_timed_out', { jobId: job.id, code });
    const done = await failAndRefund(job, 'failed', code, 'no result before the deadline', ['running']);
    if (done) await notifyOnce(done, 'failed');
    return done ?? ((await deps.store.get(job.id)) as ResearchJobRow);
  }

  async function completeJob(job: ResearchJobRow, parsed: ParsedInteraction): Promise<ResearchJobRow> {
    let report = parsed.report.trim();
    if (!report) {
      deps.alert('research_empty_report', { jobId: job.id, status: parsed.rawStatus });
      const done = await failAndRefund(job, 'failed', 'empty_report', `status ${parsed.rawStatus} without a report`, ['running']);
      if (done) await notifyOnce(done, 'failed');
      return done ?? ((await deps.store.get(job.id)) as ResearchJobRow);
    }
    if (report.length > MAX_REPORT_CHARS) report = `${report.slice(0, MAX_REPORT_CHARS).trimEnd()}\n\n_(The report was cut here because it is very long.)_`;
    const done = await deps.store.transition(job.id, ['running'], {
      status: 'completed',
      report_md: report,
      report_chars: report.length,
      sources: parsed.sources,
      sources_count: parsed.sources.length,
      usage: parsed.usage,
      progress: parsed.progress,
      incomplete: parsed.status === 'incomplete',
      title: deriveTitle(report, job.prompt),
      completed_at: iso(deps.now()),
      error_code: null,
      poll_failures: 0,
    });
    if (!done) return (await deps.store.get(job.id)) ?? job; // a cancel or a timeout won the race — it owns the outcome
    await notifyOnce(done, 'completed');
    return done;
  }

  /** What one answer from the provider means for the job. */
  async function applyParsed(job: ResearchJobRow, parsed: ParsedInteraction): Promise<ResearchJobRow> {
    const nowMs = deps.now();
    switch (parsed.status) {
      case 'completed':
      case 'incomplete':
        return completeJob(job, parsed);

      case 'failed': {
        deps.alert('research_provider_failed', { jobId: job.id, detail: parsed.error?.slice(0, 200) ?? null });
        const done = await failAndRefund(job, 'failed', 'provider_failed', parsed.error, ['running']);
        if (done) await notifyOnce(done, 'failed');
        return done ?? ((await deps.store.get(job.id)) as ResearchJobRow);
      }

      case 'cancelled': {
        const mine = job.cancel_requested;
        const done = await failAndRefund(job, mine ? 'canceled' : 'failed', mine ? 'user_canceled' : 'provider_canceled', null, ['running']);
        if (done && !mine) await notifyOnce(done, 'failed');
        return done ?? ((await deps.store.get(job.id)) as ResearchJobRow);
      }

      case 'requires_action': {
        // The agent wants input we cannot give (collaborative planning is off, so this is unexpected): stop it, refund.
        if (job.provider_interaction_id) await deps.client.cancel(job.provider_interaction_id).catch(() => undefined);
        const done = await failAndRefund(job, 'failed', 'requires_action', 'provider asked for action', ['running']);
        if (done) await notifyOnce(done, 'failed');
        return done ?? ((await deps.store.get(job.id)) as ResearchJobRow);
      }

      default: {
        // in_progress · queued · unknown: still working (an unknown status never completes a job — the deadline bounds it).
        if (nowMs > Date.parse(job.deadline_at)) return timeoutJob(job, 'timeout');
        if (job.cancel_requested && job.provider_interaction_id) await deps.client.cancel(job.provider_interaction_id).catch(() => undefined);
        const patch: ResearchJobPatch = { poll_failures: 0, next_poll_at: iso(nowMs + POLL_EVERY_MS) };
        if (Object.keys(parsed.progress).length > 0) patch.progress = parsed.progress;
        await deps.store.patch(job.id, patch).catch(() => undefined);
        return { ...job, ...patch } as ResearchJobRow;
      }
    }
  }

  /** The provider could not be read this time. */
  async function applyMiss(job: ResearchJobRow, kind: 'not_found' | 'auth' | 'transient', detail: string): Promise<ResearchJobRow> {
    const nowMs = deps.now();
    if (kind === 'not_found') {
      const started = job.provider_started_at ? Date.parse(job.provider_started_at) : Date.parse(job.created_at);
      if (nowMs - started > NOT_FOUND_GRACE_MS) {
        deps.alert('research_interaction_lost', { jobId: job.id, detail: detail.slice(0, 160) });
        const done = await failAndRefund(job, 'failed', 'provider_lost', detail, ['running']);
        if (done) await notifyOnce(done, 'failed');
        return done ?? ((await deps.store.get(job.id)) as ResearchJobRow);
      }
    }
    if (kind === 'auth') deps.alert('research_poll_auth', { jobId: job.id }); // OUR key — the user's job just waits (the deadline refunds)
    if (nowMs > Date.parse(job.deadline_at)) return timeoutJob(job, 'timeout');
    const failures = job.poll_failures + 1;
    const patch: ResearchJobPatch = { poll_failures: failures, next_poll_at: iso(nowMs + POLL_EVERY_MS * Math.min(4, failures)) };
    await deps.store.patch(job.id, patch).catch(() => undefined);
    return { ...job, ...patch } as ResearchJobRow;
  }

  /**
   * Poll a RUNNING job once and apply what the provider says. Safe to call from anywhere, any number of times: the poll
   * is claimed (one poller per MIN_POLL_GAP_MS) and every outcome is a compare-and-set.
   */
  async function advance(job: ResearchJobRow, opts: { timeoutMs?: number; force?: boolean } = {}): Promise<ResearchJobRow> {
    if (job.status !== 'running' || !job.provider_interaction_id) return job;
    const nowMs = deps.now();
    const claimed = await deps.store.claimPoll(job.id, iso(opts.force ? nowMs : nowMs - MIN_POLL_GAP_MS), iso(nowMs)).catch(() => false);
    if (!claimed) return job;
    const out = await deps.client.poll(job.provider_interaction_id, opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : undefined);
    if (!out.ok) return applyMiss(job, out.kind, out.detail);
    return applyParsed(job, out.parsed);
  }

  /** A read-through refresh: poll when the stored state is stale, with a short wait — never slower than the page can bear. */
  async function refresh(job: ResearchJobRow): Promise<ResearchJobRow> {
    if (job.status !== 'running') return job;
    try {
      return await advance(job, { timeoutMs: 6_000 });
    } catch {
      return job;
    }
  }

  // ── cancel ─────────────────────────────────────────────────────────────────

  async function cancel(jobId: string, userId: string): Promise<CancelResult> {
    let job: ResearchJobRow | null;
    try {
      job = await deps.store.getForUser(jobId, userId);
    } catch {
      return { ok: false, code: 'unavailable' };
    }
    if (!job) return { ok: false, code: 'not_found' };
    if (isTerminalResearchStatus(job.status)) return { ok: true, job };
    if (job.status === 'reserving' || job.status === 'submitting') return { ok: false, code: 'too_early' };

    if (job.status === 'reserved') {
      // Not sent yet: the submit's own CAS (reserved → submitting) can no longer win once this has.
      const done = await failAndRefund(job, 'canceled', 'user_canceled', null, ['reserved']);
      return { ok: true, job: done ?? ((await deps.store.get(job.id)) as ResearchJobRow) };
    }

    // running
    await deps.store.patch(job.id, { cancel_requested: true }).catch(() => undefined);
    const live = { ...job, cancel_requested: true };
    const id = job.provider_interaction_id;
    if (!id) {
      const done = await failAndRefund(live, 'canceled', 'user_canceled', 'no provider id', ['running']);
      return { ok: true, job: done ?? ((await deps.store.get(job.id)) as ResearchJobRow) };
    }
    const out = await deps.client.cancel(id);
    if (!out.ok && out.kind === 'not_found') {
      const done = await failAndRefund(live, 'canceled', 'user_canceled', 'interaction not found', ['running']);
      return { ok: true, job: done ?? ((await deps.store.get(job.id)) as ResearchJobRow) };
    }
    if (!out.ok && out.kind === 'transient') {
      // The provider could not confirm: the intent is recorded and the sweeper retries the cancel on its next tick.
      return { ok: true, job: { ...live } };
    }
    // The cancel was accepted — or refused because the run already ended. Either way the provider's own state decides:
    // cancelled → refund; completed in the meantime → the user gets the report they paid for.
    const polled = await deps.client.poll(id, { timeoutMs: 8_000 });
    if (!polled.ok) return { ok: true, job: live };
    if (polled.parsed.status === 'cancelled') {
      const done = await failAndRefund(live, 'canceled', 'user_canceled', null, ['running']);
      return { ok: true, job: done ?? ((await deps.store.get(job.id)) as ResearchJobRow) };
    }
    if (polled.parsed.status === 'completed' || polled.parsed.status === 'incomplete' || polled.parsed.status === 'failed') {
      return { ok: true, job: await applyParsed(live, polled.parsed) };
    }
    return { ok: true, job: live };
  }

  // ── the cron safety net ────────────────────────────────────────────────────

  async function sweep(opts: { budgetMs?: number; maxPolls?: number } = {}): Promise<SweepReport> {
    const report: SweepReport = { stuckReserving: 0, resumed: 0, stuckSubmitting: 0, polled: 0, completed: 0, failed: 0, refundsRetried: 0, errors: 0 };
    const startedAt = deps.now();
    const budget = opts.budgetMs ?? 45_000;
    const overBudget = () => deps.now() - startedAt > budget;
    const guard = async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch {
        report.errors++;
      }
    };
    const now = deps.now();

    // 1. A crash between the insert and the debit: refund whatever the ledger shows (usually nothing) and close the job.
    for (const j of await deps.store.listStuck(['reserving'], iso(now - RESERVING_STUCK_MS), 25).catch(() => [])) {
      await guard(async () => {
        const done = await failAndRefund(j, 'failed', 'stuck', 'stuck while reserving', ['reserving'], { counted: false });
        if (done) report.stuckReserving++;
      });
    }

    // 2. Charged but never sent: resume — the submit's compare-and-set keeps it to ONE POST.
    for (const j of await deps.store.listStuck(['reserved'], iso(now - RESERVED_STUCK_MS), 10).catch(() => [])) {
      if (overBudget()) break;
      await guard(async () => {
        const out = await submit(j);
        if (out.ok) report.resumed++;
      });
    }

    // 3. A crash mid-POST: the run may exist and we cannot know its id. Never re-send; refund; alert.
    for (const j of await deps.store.listStuck(['submitting'], iso(now - SUBMITTING_STUCK_MS), 10).catch(() => [])) {
      await guard(async () => {
        deps.alert('research_submit_ambiguous', { jobId: j.id, stage: 'sweep' });
        const done = await failAndRefund(j, 'failed', 'submit_ambiguous', 'worker died during the start POST', ['submitting']);
        if (done) report.stuckSubmitting++;
      });
    }

    // 4. Running jobs that are due: poll them (a few at a time) and apply the answer.
    const due = await deps.store.listDue(iso(now), opts.maxPolls ?? 25).catch(() => []);
    for (let i = 0; i < due.length && !overBudget(); i += 4) {
      await Promise.all(
        due.slice(i, i + 4).map((j) =>
          guard(async () => {
            const after = await advance(j);
            report.polled++;
            if (after.status === 'completed' && j.status !== 'completed') report.completed++;
            else if ((after.status === 'failed' || after.status === 'canceled') && j.status === 'running') report.failed++;
          }),
        ),
      );
    }

    // 5. Refunds that failed to land (the ref keeps a retry exactly-once).
    for (const j of await deps.store.listRefundPending(25).catch(() => [])) {
      await guard(async () => {
        await settleRefund(j);
        report.refundsRetried++;
      });
    }
    return report;
  }

  return { start, submit, advance, refresh, cancel, sweep, failAndRefund };
}

export type ResearchService = ReturnType<typeof createResearchService>;

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** The sanitized body a route answers a provider-side start failure with (copy in the user's language, never the provider's). */
export function providerFailureBody(failure: ProviderFailure, locale?: string) {
  return providerErrorBody({ message: failure }, locale);
}
