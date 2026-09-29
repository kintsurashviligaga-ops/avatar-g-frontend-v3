/**
 * The studio billing saga (brief §4, D5, D6):
 *
 *   estimate → price in GEL → the user CONFIRMS that exact price → reserve credits → submit ONCE
 *   → webhook / poll → completed: copy to our storage, settle, file in the Library
 *                    → failed / nsfw / canceled: refund what the LEDGER shows was taken
 *
 * Money rules this file is built around, each with the incident or doc that forced it:
 *   - No charge without confirmation: /api/generate refuses without `confirmedGel`, and refuses a confirmed
 *     price that no longer matches the server's fresh quote (the user must see the new price).
 *   - A generation POST is sent exactly once. A timeout is `submit_unknown`, reconciled by the webhook — whose
 *     URL carries our job id — or by the sweeper; never re-POSTed (no idempotency key → a retry charges twice).
 *   - Refunds pay back what the ledger shows was debited under the job's ref (refundDebitByRef), never an
 *     amount read from a row — see 20260929a for how a row-trusted refund became a mint.
 *   - Every status change is a compare-and-set, so a webhook, a poll and a cancel racing on one job cannot
 *     both refund; the refund ref is idempotent on top of that.
 *
 * Pure orchestration over injected dependencies (lib/studio/runtime.ts wires the real ones), so every path
 * below — including the ugly ones — is unit-tested without a network or a database.
 */
import { fallbacksFor, getModel, isModelEnabled, parseModelInput, type ModelEntry } from '@/lib/providers/registry';
import { priceFromUsd, pricingConfig, samePrice, type Price, type PricingConfig } from '@/lib/providers/pricing';
import { ProviderError, type ProviderAdapter, type ProviderEstimate, type ProviderStatus } from '@/lib/providers/types';
import {
  PROVIDER_ACTIVE_STATUSES,
  TERMINAL_JOB_STATUSES,
  type JobStatus,
  type StoredOutput,
  type StudioJob,
  type StudioStore,
} from '@/lib/studio/store';
import type { Semaphore } from '@/lib/studio/semaphore';

export interface LedgerPort {
  deduct(userId: string, credits: number, ref: string): Promise<{ ok: boolean; reason?: string }>;
  /** Pays back the NET amount debited under `ref` (capped at `claimed`) as `${ref}:refund`. */
  refundByRef(userId: string, ref: string, claimed?: number): Promise<{ ok: boolean; refunded: number; reason?: string }>;
}

export interface SagaDeps {
  store: StudioStore;
  provider: ProviderAdapter | null;
  ledger: LedgerPort;
  semaphore: Semaphore;
  copyOutputs(job: StudioJob, urls: string[]): Promise<StoredOutput[] | null>;
  fileInLibrary(job: StudioJob, outputs: StoredOutput[]): Promise<void>;
  webhookUrlFor(jobId: string): string | null;
  alert(marker: string, data: Record<string, unknown>): void;
  /**
   * §7: Georgian → English for the model (lib/ai/promptToEnglish in production — fail-open, returns the
   * original on any error). Optional: without it the prompt is sent as written.
   */
  translatePrompt?(text: string, medium: 'image' | 'video'): Promise<string>;
  now(): number;
  newId(): string;
  env?: NodeJS.ProcessEnv;
  pricing?: PricingConfig;
}

/** Machine codes the routes turn into HTTP statuses and the UI turns into Georgian copy. */
export type SagaCode =
  | 'not_configured'
  | 'model_unavailable'
  | 'invalid_input'
  | 'confirmation_required'
  | 'price_changed'
  | 'insufficient_credits'
  | 'billing_unavailable'
  | 'provider_unavailable'
  | 'not_found'
  | 'cannot_cancel';

export type Quote =
  | { ok: true; model: ModelEntry; input: Record<string, unknown>; price: Price; estimate: ProviderEstimate }
  | { ok: false; code: SagaCode; issues?: Array<{ path: string; message: string }> };

export type CreateResult =
  | { ok: true; job: StudioJob; price: Price }
  | { ok: false; code: SagaCode; price?: Price; issues?: Array<{ path: string; message: string }> };

export interface SweepReport {
  reservingRecovered: number;
  submittingToUnknown: number;
  unknownExpired: number;
  polled: number;
  finalized: number;
  refundsRetried: number;
  drained: number;
  errors: number;
}

const SUBMITTING_STUCK_MS = 2 * 60_000;
const RESERVING_STUCK_MS = 5 * 60_000;
const GIVE_UP_AFTER_MS = 24 * 60 * 60_000;
const MAX_SUBMIT_ATTEMPTS = 3;
const FIRST_POLL_DELAY_MS = 2 * 60_000;

export function createStudioSaga(deps: SagaDeps) {
  const env = deps.env ?? process.env;
  const pricing = deps.pricing ?? pricingConfig(env);
  const iso = (ms: number) => new Date(ms).toISOString();

  /** Next status poll: webhooks are primary, so polling starts late and backs off (docs: 2 s → 10 s is for
   *  interactive waits; a cron fallback polls at minutes-scale). */
  const nextPollAt = (job: Pick<StudioJob, 'submitted_at'>) => {
    const started = job.submitted_at ? Date.parse(job.submitted_at) : deps.now();
    const elapsed = Math.max(0, deps.now() - started);
    const delay = Math.min(10 * 60_000, Math.max(FIRST_POLL_DELAY_MS, Math.round(elapsed / 4)));
    return iso(deps.now() + delay);
  };

  function classifyQuoteError(e: unknown, model: ModelEntry): SagaCode {
    if (!(e instanceof ProviderError)) return 'provider_unavailable';
    switch (e.code) {
      case 'model_unavailable': return 'model_unavailable';
      case 'validation':
      case 'bad_request': return 'invalid_input';
      case 'credits_exhausted':
      case 'auth':
        deps.alert(e.code === 'auth' ? 'hf_auth_failed' : 'hf_credits_exhausted', { model: model.id, correlationId: e.correlationId });
        return 'provider_unavailable';
      default: return 'provider_unavailable';
    }
  }

  /** The provider's number when it gives one; otherwise the model's own price from the provider's description. */
  function costUsd(model: ModelEntry, input: Record<string, unknown>, estimate: ProviderEstimate): number | null {
    if (typeof estimate.usd === 'number' && Number.isFinite(estimate.usd)) return estimate.usd;
    const local = model.priceUsd?.(input, estimate.pricingDescription) ?? null;
    return typeof local === 'number' && Number.isFinite(local) && local > 0 ? local : null;
  }

  async function quote(modelId: string, params: unknown): Promise<Quote> {
    if (!deps.provider) return { ok: false, code: 'not_configured' };
    const model = getModel(modelId);
    if (!model || !isModelEnabled(model.id, env)) return { ok: false, code: 'model_unavailable' };
    const parsed = parseModelInput(model, params);
    if (!parsed.ok) return { ok: false, code: 'invalid_input', issues: parsed.issues };
    try {
      const estimate = await deps.provider.estimate(model.endpoint, parsed.input);
      const usd = costUsd(model, parsed.input, estimate);
      if (usd === null) {
        deps.alert('hf_unpriced_model', { model: model.id });
        return { ok: false, code: 'provider_unavailable' };
      }
      return { ok: true, model, input: parsed.input, price: priceFromUsd(usd, pricing), estimate: { ...estimate, usd } };
    } catch (e) {
      return { ok: false, code: classifyQuoteError(e, model) };
    }
  }

  /**
   * Terminal failure + refund. The refund is the ledger's NET debit under the job's ref, capped at what the
   * job reserved — so a job whose credits were never taken refunds nothing, and a double call refunds once.
   */
  async function failAndRefund(
    job: StudioJob,
    to: 'failed' | 'nsfw' | 'canceled',
    code: string,
    detail: string | null,
    from: JobStatus[],
  ): Promise<StudioJob | null> {
    const t = await deps.store.transition(job.id, from, {
      status: to,
      error_code: code,
      error_detail: detail ? detail.slice(0, 1000) : null,
      completed_at: iso(deps.now()),
      refund_state: 'pending',
    });
    if (!t) return null; // someone else already moved it — they own the refund
    await settleRefund(t);
    return deps.store.get(t.id);
  }

  async function settleRefund(job: StudioJob): Promise<void> {
    const r = await deps.ledger.refundByRef(job.user_id, job.charge_ref, job.charge_credits).catch(() => ({ ok: false, refunded: 0, reason: 'error' }));
    if (r.ok) {
      await deps.store.patch(job.id, { refund_state: 'done', refunded_credits: r.refunded });
    } else if (r.reason === 'skipped') {
      await deps.store.patch(job.id, { refund_state: 'nothing_to_refund', refunded_credits: 0 });
    } else {
      deps.alert('studio_refund_failed', { jobId: job.id, ref: job.charge_ref });
      // refund_state stays 'pending' → the sweeper retries (idempotent on the ref)
    }
  }

  /** Try same-family fallbacks that cost no more than what the user confirmed and we reserved. */
  async function tryFallback(job: StudioJob, tried: Set<string>): Promise<StudioJob | null> {
    if (!deps.provider) return null;
    for (const f of fallbacksFor(job.model_id, env)) {
      if (tried.has(f.id)) continue;
      tried.add(f.id);
      try {
        const est = await deps.provider.estimate(f.endpoint, job.input);
        const usd = costUsd(f, job.input, est);
        if (usd === null) continue;
        const p = priceFromUsd(usd, pricing);
        if (p.credits > job.charge_credits) continue; // never charge more than the user confirmed
        const moved = await deps.store.transition(job.id, ['submitting'], {
          status: 'reserved',
          model_id: f.id,
          provider_endpoint: f.endpoint,
          estimate_usd: usd,
          estimate_provider_credits: est.providerCredits,
          error_code: null,
          error_detail: null,
        });
        if (moved) return moved;
      } catch {
        /* this fallback is unavailable too — try the next */
      }
    }
    return null;
  }

  /** Submit a reserved/pending job — exactly one POST per attempt, never re-sent after an ambiguous outcome. */
  async function submit(job: StudioJob, tried: Set<string> = new Set([job.model_id])): Promise<StudioJob> {
    const model = getModel(job.model_id);
    if (!deps.provider || !model) {
      return (await failAndRefund(job, 'failed', deps.provider ? 'model_unavailable' : 'not_configured', null, ['reserved', 'pending'])) ?? job;
    }
    if (!(await deps.semaphore.acquire(job.id, model.timeoutMs))) {
      return job.status === 'pending' ? job : ((await deps.store.transition(job.id, ['reserved'], { status: 'pending' })) ?? job);
    }
    const sending = await deps.store.transition(job.id, ['reserved', 'pending'], {
      status: 'submitting',
      attempts: job.attempts + 1,
      submitted_at: iso(deps.now()),
    });
    if (!sending) return (await deps.store.get(job.id)) ?? job; // another worker owns this submit

    try {
      const sub = await deps.provider.submit(sending.provider_endpoint, sending.input, { webhookUrl: deps.webhookUrlFor(sending.id) });
      const accepted = await deps.store.transition(sending.id, ['submitting'], {
        status: sub.status === 'in_progress' ? 'in_progress' : 'queued',
        provider_request_id: sub.requestId,
        correlation_id: sub.correlationId,
        next_poll_at: iso(deps.now() + FIRST_POLL_DELAY_MS),
      });
      // A webhook may already have raced ahead of this write (it reconciles by job id) — then keep its state.
      return accepted ?? (await deps.store.get(sending.id)) ?? sending;
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError('network', { ambiguous: true, detail: String(e) });

      if (err.ambiguous) {
        // The request MAY exist and be running: keep the concurrency lease, keep the credits, never re-POST.
        deps.alert('hf_submit_ambiguous', { jobId: sending.id, code: err.code });
        return (await deps.store.transition(sending.id, ['submitting'], {
          status: 'submit_unknown',
          error_code: err.code,
          error_detail: err.detail || null,
          next_poll_at: iso(deps.now() + FIRST_POLL_DELAY_MS),
        })) ?? sending;
      }

      await deps.semaphore.release(sending.id);

      switch (err.code) {
        case 'concurrency':
          return (await deps.store.transition(sending.id, ['submitting'], { status: 'pending' })) ?? sending;
        case 'model_unavailable': {
          const next = await tryFallback(sending, tried);
          if (next) return submit(next, tried);
          return (await failAndRefund(sending, 'failed', 'model_unavailable', err.detail, ['submitting'])) ?? sending;
        }
        case 'credits_exhausted':
        case 'auth':
          deps.alert(err.code === 'auth' ? 'hf_auth_failed' : 'hf_credits_exhausted', { jobId: sending.id, correlationId: err.correlationId });
          return (await failAndRefund(sending, 'failed', 'provider_unavailable', err.detail, ['submitting'])) ?? sending;
        case 'validation':
        case 'bad_request':
          return (await failAndRefund(sending, 'failed', 'invalid_input', err.detail, ['submitting'])) ?? sending;
        case 'server':
          if (sending.attempts < MAX_SUBMIT_ATTEMPTS) {
            // A definite 5xx response: the docs say retry with backoff. The sweeper resubmits from `pending`.
            return (await deps.store.transition(sending.id, ['submitting'], { status: 'pending' })) ?? sending;
          }
          return (await failAndRefund(sending, 'failed', 'provider_unavailable', err.detail, ['submitting'])) ?? sending;
        default:
          return (await failAndRefund(sending, 'failed', 'provider_unavailable', err.detail, ['submitting'])) ?? sending;
      }
    }
  }

  /**
   * Create a job for a CONFIRMED price and start it. Nothing is charged unless the price the user confirmed
   * equals a fresh server-side quote.
   */
  async function create(req: {
    userId: string;
    modelId: string;
    params: unknown;
    confirmedGel?: number | null;
    promptOriginal?: string | null;
  }): Promise<CreateResult> {
    const q = await quote(req.modelId, req.params);
    if (!q.ok) return q;
    if (req.confirmedGel === undefined || req.confirmedGel === null) return { ok: false, code: 'confirmation_required', price: q.price };
    if (!samePrice(req.confirmedGel, q.price)) return { ok: false, code: 'price_changed', price: q.price };

    // §7: the user's prompt is kept exactly as written; the MODEL receives an English rendering (these models
    // read English — a Georgian brief arrives as noise). Only after the price is confirmed, so live estimates
    // never pay for a translation. The price cannot move: it depends on duration/resolution, not on words.
    const original = typeof q.input.prompt === 'string' ? q.input.prompt : null;
    let input = q.input;
    if (original && deps.translatePrompt) {
      const en = await deps.translatePrompt(original, q.model.output === 'video' ? 'video' : 'image').catch(() => original);
      if (typeof en === 'string' && en.trim() && en !== original) {
        // A translation the schema refuses (over-long, emptied) is dropped — never sent, never guessed at.
        const re = parseModelInput(q.model, { ...q.input, prompt: en.trim() });
        if (re.ok) input = re.input;
      }
    }

    const id = deps.newId();
    const job = await deps.store.insert({
      id,
      user_id: req.userId,
      service: q.model.service,
      model_id: q.model.id,
      provider: q.model.provider,
      provider_endpoint: q.model.endpoint,
      input,
      prompt_original: (req.promptOriginal ?? original)?.slice(0, 4000) ?? null,
      estimate_provider_credits: q.estimate.providerCredits,
      estimate_usd: q.estimate.usd,
      estimate_gel: q.price.gel,
      charge_credits: q.price.credits,
      charge_ref: `studio:${id}`,
    });

    const debit = await deps.ledger.deduct(req.userId, q.price.credits, job.charge_ref).catch(() => ({ ok: false, reason: 'error' }));
    if (!debit.ok) {
      const code: SagaCode = debit.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable';
      // 'error' can mean "the debit committed and the answer was lost" — failAndRefund refunds only what the
      // ledger actually shows, so this is safe either way.
      await failAndRefund(job, 'failed', code, null, ['reserving']);
      return { ok: false, code, price: q.price };
    }
    const reserved = await deps.store.transition(job.id, ['reserving'], { status: 'reserved' });
    if (!reserved) return { ok: true, job: (await deps.store.get(job.id)) ?? job, price: q.price };
    return { ok: true, job: await submit(reserved), price: q.price };
  }

  /**
   * One provider event (webhook or poll). Idempotent: an event for a job already past it is ignored, and the
   * transitions are compare-and-set.
   */
  async function applyEvent(ev: {
    jobId?: string | null;
    requestId: string;
    status: ProviderStatus;
    outputUrls?: string[];
    error?: string | null;
    correlationId?: string | null;
  }): Promise<{ applied: boolean; reason?: string; job?: StudioJob }> {
    let job = ev.jobId ? await deps.store.get(ev.jobId) : await deps.store.byRequestId(ev.requestId);
    if (!job) return { applied: false, reason: 'unknown_job' };
    if (job.provider_request_id && job.provider_request_id !== ev.requestId) {
      deps.alert('hf_event_request_mismatch', { jobId: job.id });
      return { applied: false, reason: 'request_mismatch', job };
    }
    if (!job.provider_request_id) {
      // Reconciliation: the submit timed out (or its write lost a race) and this event tells us the id.
      await deps.store.patch(job.id, { provider_request_id: ev.requestId });
      job = { ...job, provider_request_id: ev.requestId };
    }
    if (TERMINAL_JOB_STATUSES.has(job.status) || job.status === 'finalizing') {
      return { applied: false, reason: 'already_settled', job };
    }

    switch (ev.status) {
      case 'queued':
      case 'in_progress': {
        const t = await deps.store.transition(job.id, PROVIDER_ACTIVE_STATUSES, {
          status: ev.status,
          correlation_id: ev.correlationId ?? job.correlation_id,
          next_poll_at: nextPollAt(job),
        });
        return { applied: !!t, job: t ?? job };
      }
      case 'completed': {
        const urls = (ev.outputUrls ?? []).filter((u) => typeof u === 'string' && u.startsWith('https://'));
        if (urls.length === 0) {
          await deps.semaphore.release(job.id);
          const f = await failAndRefund(job, 'failed', 'generation_failed', 'completed without outputs', PROVIDER_ACTIVE_STATUSES);
          return { applied: !!f, job: f ?? job };
        }
        const t = await deps.store.transition(job.id, PROVIDER_ACTIVE_STATUSES, { status: 'finalizing', provider_output_urls: urls });
        await deps.semaphore.release(job.id);
        return { applied: !!t, job: t ?? job };
      }
      case 'failed':
      case 'nsfw':
      case 'canceled': {
        await deps.semaphore.release(job.id);
        const to = ev.status;
        const code = to === 'nsfw' ? 'content_rejected' : to === 'canceled' ? 'canceled' : 'generation_failed';
        const f = await failAndRefund(job, to, code, ev.error ?? null, PROVIDER_ACTIVE_STATUSES);
        return { applied: !!f, job: f ?? job };
      }
    }
  }

  /** Copy a finished job's outputs into our storage, settle, and file it in the Library. Retry-safe. */
  async function finalize(job: StudioJob): Promise<StudioJob> {
    if (job.status !== 'finalizing') return job;
    const stored = await deps.copyOutputs(job, job.provider_output_urls).catch(() => null);
    if (!stored || stored.length === 0) return job; // retried by the next read or sweep
    const done = await deps.store.transition(job.id, ['finalizing'], {
      status: 'completed',
      output_urls: stored,
      charged_gel: job.estimate_gel,
      completed_at: iso(deps.now()),
      error_code: null,
      error_detail: null,
    });
    if (!done) return (await deps.store.get(job.id)) ?? job;
    await deps.fileInLibrary(done, stored).catch(() => undefined);
    return done;
  }

  /** User cancel. Only before the provider starts work — after that the provider charges and so do we. */
  async function cancel(jobId: string, userId: string): Promise<{ ok: true; job: StudioJob } | { ok: false; code: SagaCode }> {
    const job = await deps.store.getForUser(jobId, userId);
    if (!job) return { ok: false, code: 'not_found' };
    if (job.status === 'reserving' || job.status === 'reserved' || job.status === 'pending') {
      await deps.semaphore.release(job.id);
      const f = await failAndRefund(job, 'canceled', 'canceled', null, ['reserving', 'reserved', 'pending']);
      return f ? { ok: true, job: f } : { ok: false, code: 'cannot_cancel' };
    }
    if (job.status === 'queued' && job.provider_request_id && deps.provider) {
      const canceled = await deps.provider.cancel(job.provider_request_id).catch(() => false);
      if (!canceled) return { ok: false, code: 'cannot_cancel' };
      await deps.semaphore.release(job.id);
      const f = await failAndRefund(job, 'canceled', 'canceled', null, ['queued']);
      return f ? { ok: true, job: f } : { ok: false, code: 'cannot_cancel' };
    }
    return { ok: false, code: 'cannot_cancel' };
  }

  /** The cron safety net: every path a webhook or a crashed instance could have left behind. */
  async function sweep(opts: { maxDrain?: number } = {}): Promise<SweepReport> {
    const report: SweepReport = { reservingRecovered: 0, submittingToUnknown: 0, unknownExpired: 0, polled: 0, finalized: 0, refundsRetried: 0, drained: 0, errors: 0 };
    const now = deps.now();
    const guard = async (fn: () => Promise<void>) => { try { await fn(); } catch { report.errors++; } };

    // 1. A crash between inserting the row and debiting: refund whatever the ledger shows, close the job.
    for (const j of await deps.store.listByStatus(['reserving'], { updatedBefore: iso(now - RESERVING_STUCK_MS) })) {
      await guard(async () => { if (await failAndRefund(j, 'failed', 'billing_unavailable', 'stuck while reserving', ['reserving'])) report.reservingRecovered++; });
    }

    // 2. A crash mid-POST: the request may exist. Same treatment as a timeout — never re-POST.
    for (const j of await deps.store.listByStatus(['submitting'], { updatedBefore: iso(now - SUBMITTING_STUCK_MS) })) {
      await guard(async () => {
        const t = await deps.store.transition(j.id, ['submitting'], { status: 'submit_unknown', error_code: 'timeout', next_poll_at: iso(now) });
        if (t) report.submittingToUnknown++;
      });
    }

    // 3. Provider-side work: poll what is due; give up only on what can no longer be reconciled.
    for (const j of await deps.store.listByStatus(['submit_unknown', 'queued', 'in_progress'], { dueBefore: iso(now) })) {
      await guard(async () => {
        const model = getModel(j.model_id);
        const age = now - Date.parse(j.submitted_at ?? j.created_at);
        if (!j.provider_request_id) {
          // Never learned the id and no webhook reconciled it within the model's window: refund.
          if (age > (model?.timeoutMs ?? 30 * 60_000)) {
            await deps.semaphore.release(j.id);
            deps.alert('hf_submit_unreconciled', { jobId: j.id });
            if (await failAndRefund(j, 'failed', 'provider_unavailable', 'submission could not be confirmed', ['submit_unknown'])) report.unknownExpired++;
          } else {
            await deps.store.patch(j.id, { next_poll_at: nextPollAt(j) });
          }
          return;
        }
        if (!deps.provider) return;
        const r = await deps.provider.status(j.provider_request_id);
        report.polled++;
        if (r.status === 'queued' || r.status === 'in_progress') {
          if (age > GIVE_UP_AFTER_MS) {
            const canceled = r.status === 'queued' ? await deps.provider.cancel(j.provider_request_id).catch(() => false) : false;
            deps.alert('hf_request_stuck', { jobId: j.id, status: r.status, canceled });
            if (canceled) {
              await deps.semaphore.release(j.id);
              await failAndRefund(j, 'failed', 'provider_unavailable', 'stuck > 24h', PROVIDER_ACTIVE_STATUSES);
              return;
            }
          }
          await deps.store.patch(j.id, { next_poll_at: nextPollAt(j) });
        }
        await applyEvent({ jobId: j.id, requestId: j.provider_request_id, status: r.status, outputUrls: r.outputUrls, error: r.error, correlationId: r.correlationId });
      });
    }

    // 4. Finished at the provider, not yet copied to our storage.
    for (const j of await deps.store.listByStatus(['finalizing'])) {
      await guard(async () => {
        const done = await finalize(j);
        if (done.status === 'completed') report.finalized++;
        else if (now - Date.parse(j.updated_at) > 6 * 24 * 60 * 60_000) deps.alert('studio_output_copy_stale', { jobId: j.id });
      });
    }

    // 5. Refunds that failed to land (the ref keeps a retry exactly-once).
    for (const j of await deps.store.listRefundPending()) {
      await guard(async () => { await settleRefund(j); report.refundsRetried++; });
    }

    // 6. Drain the local queue while the provider has room.
    let budget = opts.maxDrain ?? 4;
    for (const j of await deps.store.listByStatus(['reserved', 'pending'], { limit: budget * 2 })) {
      if (budget <= 0) break;
      await guard(async () => {
        const s = await submit(j);
        if (s.status !== 'pending' && s.status !== 'reserved') report.drained++;
        if (s.status === 'pending') budget = 0; // no slot free — stop for this tick
        else budget--;
      });
    }
    return report;
  }

  return { quote, create, submit, applyEvent, finalize, cancel, sweep };
}

export type StudioSaga = ReturnType<typeof createStudioSaga>;

/** What a client may see of a job: no provider ids, no endpoint, no internal error text. */
export function publicJob(job: StudioJob, signedUrls: string[] = []) {
  return {
    id: job.id,
    status: job.status,
    service: job.service,
    modelId: job.model_id,
    priceGel: job.estimate_gel,
    credits: job.charge_credits,
    refunded: job.refund_state === 'done',
    errorCode: job.error_code,
    /** §7: both versions are shown (the UI folds the English one away). */
    promptOriginal: job.prompt_original,
    promptSent: typeof job.input?.prompt === 'string' ? (job.input.prompt as string) : null,
    outputUrls: job.status === 'completed' ? signedUrls : [],
    createdAt: job.created_at,
    completedAt: job.completed_at,
  };
}

