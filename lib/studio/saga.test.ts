/** @jest-environment node */
/**
 * The studio billing saga, end to end over fakes: an in-memory store with the real table's semantics
 * (compare-and-set transitions, unique request ids, event dedupe), a scripted provider, a ledger that behaves
 * like deduct_credits / refund_credits, and a counting semaphore.
 *
 * The cases that matter most are the money ones: nothing charged without a confirmed price; a POST sent once
 * even when it times out; refunds that pay back exactly what was taken, once, whatever races happen.
 */
import { createStudioSaga, publicJob, type SagaDeps } from './saga';
import { ProviderError, type ProviderAdapter, type ProviderStatus } from '@/lib/providers/types';
import type { JobPatch, JobStatus, StoredOutput, StudioJob, StudioStore } from './store';
import type { Semaphore } from './semaphore';

/* ─── fakes ────────────────────────────────────────────────────────────────────────────────── */

let clock = Date.parse('2026-09-29T10:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function memoryStore() {
  const rows = new Map<string, StudioJob>();
  const events = new Set<string>();
  const store: StudioStore = {
    async insert(j) {
      const now = iso(clock);
      const row: StudioJob = {
        ...j, status: 'reserving', provider_request_id: null, charged_gel: null, refund_state: null, refunded_credits: 0,
        provider_output_urls: [], output_urls: [], correlation_id: null, error_code: null, error_detail: null, attempts: 0,
        created_at: now, updated_at: now, submitted_at: null, completed_at: null, next_poll_at: null,
      };
      rows.set(j.id, row);
      return { ...row };
    },
    async get(id) { const r = rows.get(id); return r ? { ...r } : null; },
    async getForUser(id, userId) { const r = rows.get(id); return r && r.user_id === userId ? { ...r } : null; },
    async byRequestId(req) { for (const r of rows.values()) if (r.provider_request_id === req) return { ...r }; return null; },
    async transition(id, from, patch) {
      const r = rows.get(id);
      if (!r || !from.includes(r.status)) return null;
      if (patch.provider_request_id) for (const o of rows.values()) if (o.id !== id && o.provider_request_id === patch.provider_request_id) throw new Error('unique');
      const next = { ...r, ...patch, updated_at: iso(clock) } as StudioJob;
      rows.set(id, next);
      return { ...next };
    },
    async patch(id, patch) { const r = rows.get(id); if (r) rows.set(id, { ...r, ...patch, updated_at: iso(clock) } as StudioJob); },
    async listByStatus(statuses, opts = {}) {
      return [...rows.values()]
        .filter((r) => statuses.includes(r.status))
        .filter((r) => !opts.updatedBefore || r.updated_at < opts.updatedBefore)
        .filter((r) => !opts.dueBefore || !r.next_poll_at || r.next_poll_at <= opts.dueBefore)
        .slice(0, opts.limit ?? 25)
        .map((r) => ({ ...r }));
    },
    async listRefundPending() { return [...rows.values()].filter((r) => r.refund_state === 'pending').map((r) => ({ ...r })); },
    async recordEvent(ev) {
      const k = `${ev.provider}|${ev.requestId}|${ev.status}`;
      if (events.has(k)) return false;
      events.add(k);
      return true;
    },
  };
  return { store, rows };
}

/** deduct_credits / refund_credits semantics: debit idempotent on ref, refund = net debit, once per ref. */
function fakeLedger(balance = 1000) {
  const entries: Array<{ ref: string; delta: number }> = [];
  const state = { balance, deductMode: 'ok' as 'ok' | 'insufficient' | 'error-after-commit' | 'error-before-commit' };
  return {
    state,
    entries,
    port: {
      async deduct(_userId: string, credits: number, ref: string) {
        if (state.deductMode === 'insufficient' || state.balance < credits) return { ok: false, reason: 'insufficient' };
        if (state.deductMode === 'error-before-commit') return { ok: false, reason: 'error' };
        if (!entries.some((e) => e.ref === ref && e.delta < 0)) { entries.push({ ref, delta: -credits }); state.balance -= credits; }
        if (state.deductMode === 'error-after-commit') return { ok: false, reason: 'error' };
        return { ok: true };
      },
      async refundByRef(_userId: string, ref: string, claimed?: number) {
        const taken = entries.filter((e) => e.ref === ref && e.delta < 0).reduce((s, e) => s - e.delta, 0);
        const given = entries.filter((e) => e.ref.startsWith(`${ref}:`) && e.delta > 0).reduce((s, e) => s + e.delta, 0);
        const amount = Math.min(Math.max(0, taken - given), claimed ?? Infinity);
        if (!(amount > 0)) return { ok: false, refunded: 0, reason: 'skipped' };
        entries.push({ ref: `${ref}:refund`, delta: amount });
        state.balance += amount;
        return { ok: true, refunded: amount };
      },
    },
  };
}

function countingSemaphore(limit = 4): Semaphore & { held: Set<string> } {
  const held = new Set<string>();
  return {
    held,
    async acquire(m) { if (held.has(m)) return true; if (held.size >= limit) return false; held.add(m); return true; },
    async release(m) { held.delete(m); },
  };
}

type Script = { usd?: number; submit?: () => Promise<{ requestId: string; status: ProviderStatus }>; status?: ProviderStatus; outputs?: string[]; cancel?: boolean; estimateError?: ProviderError };

function fakeProvider(script: Script = {}) {
  const calls = { estimate: 0, submit: 0, status: 0, cancel: 0, endpoints: [] as string[] };
  const provider: ProviderAdapter = {
    id: 'higgsfield',
    async estimate(endpoint) {
      calls.estimate++;
      if (script.estimateError) throw script.estimateError;
      return { usd: endpoint.includes('/pro/') ? (script.usd ?? 0.4) * 2 : script.usd ?? 0.4, providerCredits: 6, correlationId: 'c-est' };
    },
    async submit(endpoint) {
      calls.submit++;
      calls.endpoints.push(endpoint);
      const r = script.submit ? await script.submit() : { requestId: `req-${calls.submit}-aaaaaaaa`, status: 'queued' as const };
      return { ...r, correlationId: 'c-sub' };
    },
    async status(requestId) {
      calls.status++;
      return { requestId, status: script.status ?? 'in_progress', outputUrls: script.outputs ?? [], error: null, correlationId: 'c-st' };
    },
    async cancel() { calls.cancel++; return script.cancel ?? true; },
    async createUpload() { throw new Error('unused'); },
  };
  return { provider, calls };
}

function setup(script: Script = {}, opts: { balance?: number; slots?: number; copy?: 'ok' | 'fail' } = {}) {
  const { store, rows } = memoryStore();
  const ledger = fakeLedger(opts.balance);
  const sem = countingSemaphore(opts.slots);
  const { provider, calls } = fakeProvider(script);
  const alerts: string[] = [];
  const filed: string[] = [];
  let seq = 0;
  const deps: SagaDeps = {
    store,
    provider,
    ledger: ledger.port,
    semaphore: sem,
    async copyOutputs(job, urls) {
      if (opts.copy === 'fail') return null;
      return urls.map((_, i): StoredOutput => ({ bucket: 'studio', path: `${job.user_id}/${job.id}/${i}.mp4`, contentType: 'video/mp4' }));
    },
    async fileInLibrary(job) { filed.push(job.id); },
    webhookUrlFor: (id) => `https://myavatar.ge/api/webhooks/higgsfield?job=${id}&sig=x`,
    alert: (m) => { alerts.push(m); },
    now: () => clock,
    newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
    env: { HF_USD_GEL_RATE: '2.7', HF_GEL_MARGIN: '1.35' } as NodeJS.ProcessEnv,
  };
  return { saga: createStudioSaga(deps), rows, ledger, sem, calls, alerts, filed, store };
}

const USER = 'user-1';
const T2V = { modelId: 'hf/kling-3-std-t2v', params: { prompt: 'თბილისი ღამით, კინემატოგრაფიული' } };
// 0.4 USD × 2.7 × 1.35 = 1.458 GEL → 15 credits → 1.50 GEL
const PRICE_GEL = 1.5;
const status = (rows: Map<string, StudioJob>, id: string): JobStatus => rows.get(id)!.status;

beforeEach(() => { clock = Date.parse('2026-09-29T10:00:00Z'); });

/* ─── price confirmation ───────────────────────────────────────────────────────────────────── */

describe('no money moves without a confirmed price', () => {
  test('quote → 1.50 ₾ / 15 credits, provider USD never rounds a credit away', async () => {
    const { saga } = setup();
    const q = await saga.quote(T2V.modelId, T2V.params);
    expect(q.ok && q.price).toMatchObject({ credits: 15, gel: 1.5 });
  });

  test('create without confirmedGel → confirmation_required, nothing charged, nothing submitted', async () => {
    const { saga, ledger, calls, rows } = setup();
    const r = await saga.create({ userId: USER, ...T2V });
    expect(r).toMatchObject({ ok: false, code: 'confirmation_required', price: { credits: 15 } });
    expect(ledger.entries).toEqual([]);
    expect(calls.submit).toBe(0);
    expect(rows.size).toBe(0);
  });

  test('a confirmed price that no longer matches → price_changed, nothing charged', async () => {
    const { saga, ledger, calls } = setup();
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: 1.2 });
    expect(r).toMatchObject({ ok: false, code: 'price_changed', price: { gel: 1.5 } });
    expect(ledger.entries).toEqual([]);
    expect(calls.submit).toBe(0);
  });

  test('invalid params never reach the provider (not even for an estimate)', async () => {
    const { saga, calls } = setup();
    const r = await saga.create({ userId: USER, modelId: T2V.modelId, params: { prompt: 'x', duration: 99 }, confirmedGel: PRICE_GEL });
    expect(r).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(calls.estimate).toBe(0);
  });

  test('an unknown or disabled model is refused before anything else', async () => {
    const { saga, calls } = setup();
    expect(await saga.create({ userId: USER, modelId: 'hf/nope', params: {}, confirmedGel: 1 })).toMatchObject({ ok: false, code: 'model_unavailable' });
    expect(calls.estimate).toBe(0);
  });
});

/* ─── the happy path ───────────────────────────────────────────────────────────────────────── */

describe('happy path', () => {
  test('reserve → submit once with a signed webhook → completed webhook → finalize → our storage, settled, filed', async () => {
    const { saga, rows, ledger, calls, sem, filed } = setup();
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.job.id;
    expect(r.job.status).toBe('queued');
    expect(calls.submit).toBe(1);
    expect(ledger.entries).toEqual([{ ref: `studio:${id}`, delta: -15 }]);
    expect(sem.held.has(id)).toBe(true);

    const reqId = rows.get(id)!.provider_request_id!;
    await saga.applyEvent({ jobId: id, requestId: reqId, status: 'in_progress' });
    expect(status(rows, id)).toBe('in_progress');

    await saga.applyEvent({ jobId: id, requestId: reqId, status: 'completed', outputUrls: ['https://cdn.higgsfield.ai/out.mp4'] });
    expect(status(rows, id)).toBe('finalizing');
    expect(sem.held.has(id)).toBe(false); // the provider slot frees as soon as the provider is done

    const done = await saga.finalize(rows.get(id)!);
    expect(done.status).toBe('completed');
    expect(done.output_urls).toEqual([{ bucket: 'studio', path: `${USER}/${id}/0.mp4`, contentType: 'video/mp4' }]);
    expect(done.charged_gel).toBe(1.5);
    expect(filed).toEqual([id]);
    expect(ledger.state.balance).toBe(1000 - 15);
    // and the user-facing view carries no provider id, endpoint or internal error text
    expect(Object.keys(publicJob(done, ['https://signed']))).not.toEqual(expect.arrayContaining(['provider_request_id', 'provider_endpoint', 'error_detail']));
  });

  test('a finalize whose copy fails stays finalizing (retried later) — the user is never handed a provider URL', async () => {
    const { saga, rows } = setup({}, { copy: 'fail' });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    const id = r.job.id;
    await saga.applyEvent({ jobId: id, requestId: rows.get(id)!.provider_request_id!, status: 'completed', outputUrls: ['https://cdn.higgsfield.ai/o.mp4'] });
    const j = await saga.finalize(rows.get(id)!);
    expect(j.status).toBe('finalizing');
    expect(publicJob(j).outputUrls).toEqual([]);
  });
});

/* ─── the POST is sent once ────────────────────────────────────────────────────────────────── */

describe('a generation POST is never repeated', () => {
  test('a submit timeout → submit_unknown, exactly ONE POST, credits held; the webhook (job id in its URL) reconciles', async () => {
    const { saga, rows, calls, ledger, alerts } = setup({
      submit: async () => { throw new ProviderError('timeout', { ambiguous: true }); },
    });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    const id = r.job.id;
    expect(r.job.status).toBe('submit_unknown');
    expect(calls.submit).toBe(1);
    expect(ledger.state.balance).toBe(985); // still reserved — the request may be running
    expect(alerts).toContain('hf_submit_ambiguous');

    // The sweeper must NOT re-POST it…
    clock += 3 * 60_000;
    await saga.sweep();
    expect(calls.submit).toBe(1);

    // …and the webhook, which knows the job by its URL, tells us the request id and the outcome.
    await saga.applyEvent({ jobId: id, requestId: 'late-request-123456', status: 'completed', outputUrls: ['https://cdn.higgsfield.ai/x.mp4'] });
    expect(rows.get(id)!.provider_request_id).toBe('late-request-123456');
    expect(status(rows, id)).toBe('finalizing');
  });

  test('an unreconciled submit_unknown is refunded after the model’s window — and still never re-POSTed', async () => {
    const { saga, rows, calls, ledger, alerts } = setup({
      submit: async () => { throw new ProviderError('network', { ambiguous: true }); },
    });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    clock += 21 * 60_000; // Kling std window is 20 min
    const rep = await saga.sweep();
    expect(rep.unknownExpired).toBe(1);
    expect(status(rows, r.job.id)).toBe('failed');
    expect(ledger.state.balance).toBe(1000);
    expect(calls.submit).toBe(1);
    expect(alerts).toContain('hf_submit_unreconciled');
  });

  test('a crash mid-POST (row left `submitting`) is treated as ambiguous, not resubmitted', async () => {
    const { saga, rows, store, calls } = setup();
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    await store.patch(r.job.id, { status: 'submitting', provider_request_id: null } as JobPatch);
    clock += 3 * 60_000;
    const rep = await saga.sweep();
    expect(rep.submittingToUnknown).toBe(1);
    expect(status(rows, r.job.id)).toBe('submit_unknown');
    expect(calls.submit).toBe(1);
  });
});

/* ─── refunds ──────────────────────────────────────────────────────────────────────────────── */

describe('refunds pay back exactly what was taken, once', () => {
  test('failed → refunded in full; a duplicate failed event and a racing poll refund nothing more', async () => {
    const { saga, rows, ledger, sem } = setup({ status: 'failed' });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    const id = r.job.id;
    const req = rows.get(id)!.provider_request_id!;
    await saga.applyEvent({ jobId: id, requestId: req, status: 'failed', error: 'Generation failed' });
    await saga.applyEvent({ jobId: id, requestId: req, status: 'failed', error: 'Generation failed' });
    clock += 10 * 60_000;
    await saga.sweep();
    expect(status(rows, id)).toBe('failed');
    expect(rows.get(id)!.refund_state).toBe('done');
    expect(ledger.entries.filter((e) => e.delta > 0)).toEqual([{ ref: `studio:${id}:refund`, delta: 15 }]);
    expect(ledger.state.balance).toBe(1000);
    expect(sem.held.has(id)).toBe(false);
  });

  test('nsfw → refunded, coded content_rejected (the UI says why and that the money came back)', async () => {
    const { saga, rows, ledger } = setup();
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    await saga.applyEvent({ jobId: r.job.id, requestId: rows.get(r.job.id)!.provider_request_id!, status: 'nsfw' });
    expect(rows.get(r.job.id)).toMatchObject({ status: 'nsfw', error_code: 'content_rejected', refund_state: 'done' });
    expect(ledger.state.balance).toBe(1000);
  });

  test('completed with no outputs is a failure, refunded', async () => {
    const { saga, rows, ledger } = setup();
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    await saga.applyEvent({ jobId: r.job.id, requestId: rows.get(r.job.id)!.provider_request_id!, status: 'completed', outputUrls: [] });
    expect(status(rows, r.job.id)).toBe('failed');
    expect(ledger.state.balance).toBe(1000);
  });

  test('insufficient credits → job failed, provider never called', async () => {
    const { saga, calls, rows } = setup({}, { balance: 5 });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    expect(r).toMatchObject({ ok: false, code: 'insufficient_credits' });
    expect(calls.submit).toBe(0);
    expect([...rows.values()][0]).toMatchObject({ status: 'failed', refund_state: 'nothing_to_refund' });
  });

  test('a ledger error AFTER the debit committed is still refunded — the ledger, not the error, decides', async () => {
    const { saga, ledger } = setup();
    ledger.state.deductMode = 'error-after-commit';
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    expect(r).toMatchObject({ ok: false, code: 'billing_unavailable' });
    expect(ledger.state.balance).toBe(1000);
  });

  test('a refund that fails to land is retried by the sweeper, exactly once when it does', async () => {
    const { saga, rows, ledger } = setup();
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    const realRefund = ledger.port.refundByRef;
    ledger.port.refundByRef = async () => ({ ok: false, refunded: 0, reason: 'error' });
    await saga.applyEvent({ jobId: r.job.id, requestId: rows.get(r.job.id)!.provider_request_id!, status: 'failed' });
    expect(rows.get(r.job.id)!.refund_state).toBe('pending');
    ledger.port.refundByRef = realRefund;
    await saga.sweep();
    await saga.sweep();
    expect(rows.get(r.job.id)!.refund_state).toBe('done');
    expect(ledger.state.balance).toBe(1000);
  });
});

/* ─── provider errors ──────────────────────────────────────────────────────────────────────── */

describe('provider errors', () => {
  test('concurrency 400 → pending (credits kept, slot released), drained by the sweeper later', async () => {
    let busy = true;
    const { saga, rows, calls, sem } = setup({
      submit: async () => {
        if (busy) throw new ProviderError('concurrency', { httpStatus: 400 });
        return { requestId: 'req-after-queue-01', status: 'queued' };
      },
    });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    expect(r.job.status).toBe('pending');
    expect(sem.held.has(r.job.id)).toBe(false);
    busy = false;
    const rep = await saga.sweep();
    expect(rep.drained).toBe(1);
    expect(status(rows, r.job.id)).toBe('queued');
    expect(calls.submit).toBe(2); // the first POST was definitively REJECTED (400), so this is not a repeat
  });

  test('our own semaphore full → pending without a POST at all', async () => {
    const { saga, calls, rows } = setup({}, { slots: 0 });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    expect(status(rows, r.job.id)).toBe('pending');
    expect(calls.submit).toBe(0);
  });

  test('403 (our Higgsfield credits exhausted) → admin alert + full refund', async () => {
    const { saga, rows, ledger, alerts } = setup({
      submit: async () => { throw new ProviderError('credits_exhausted', { httpStatus: 403 }); },
    });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    expect(alerts).toContain('hf_credits_exhausted');
    expect(rows.get(r.job.id)).toMatchObject({ status: 'failed', error_code: 'provider_unavailable' });
    expect(ledger.state.balance).toBe(1000);
  });

  test('model unavailable → same-family fallback when it costs no more than was confirmed', async () => {
    let first = true;
    const { saga, rows, calls } = setup({
      submit: async () => {
        if (first) { first = false; throw new ProviderError('model_unavailable', { httpStatus: 503 }); }
        return { requestId: 'req-fallback-0001', status: 'queued' };
      },
    });
    // Pro is quoted at 2× → 30 credits; the std fallback costs 15 ≤ 30, so it may stand in.
    const q = await saga.quote('hf/kling-3-pro-t2v', T2V.params);
    if (!q.ok) throw new Error('quote failed');
    const r = await saga.create({ userId: USER, modelId: 'hf/kling-3-pro-t2v', params: T2V.params, confirmedGel: q.price.gel });
    if (!r.ok) throw new Error('create failed');
    expect(rows.get(r.job.id)).toMatchObject({ status: 'queued', model_id: 'hf/kling-3-std-t2v' });
    expect(calls.endpoints).toEqual(['kling-video/v3.0/pro/text-to-video', 'kling-video/v3.0/std/text-to-video']);
  });

  test('model unavailable with no eligible fallback → refunded', async () => {
    const { saga, rows, ledger } = setup({
      submit: async () => { throw new ProviderError('model_unavailable', { httpStatus: 404 }); },
    });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    expect(rows.get(r.job.id)).toMatchObject({ status: 'failed', error_code: 'model_unavailable' });
    expect(ledger.state.balance).toBe(1000);
  });

  test('422 validation → refunded as invalid_input', async () => {
    const { saga, rows, ledger } = setup({
      submit: async () => { throw new ProviderError('validation', { httpStatus: 422 }); },
    });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    expect(rows.get(r.job.id)).toMatchObject({ status: 'failed', error_code: 'invalid_input' });
    expect(ledger.state.balance).toBe(1000);
  });
});

/* ─── events and cancel ────────────────────────────────────────────────────────────────────── */

describe('events and cancel', () => {
  test('an event naming a different request id for the job is ignored', async () => {
    const { saga, rows, ledger, alerts } = setup();
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    const res = await saga.applyEvent({ jobId: r.job.id, requestId: 'someone-elses-request', status: 'failed' });
    expect(res).toMatchObject({ applied: false, reason: 'request_mismatch' });
    expect(status(rows, r.job.id)).toBe('queued');
    expect(ledger.state.balance).toBe(985);
    expect(alerts).toContain('hf_event_request_mismatch');
  });

  test('cancel while queued at the provider → provider cancel + full refund', async () => {
    const { saga, rows, ledger, calls } = setup({ cancel: true });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    const c = await saga.cancel(r.job.id, USER);
    expect(c.ok).toBe(true);
    expect(calls.cancel).toBe(1);
    expect(rows.get(r.job.id)).toMatchObject({ status: 'canceled', refund_state: 'done' });
    expect(ledger.state.balance).toBe(1000);
  });

  test('cancel once the provider started → refused, nothing refunded', async () => {
    const { saga, rows, ledger } = setup();
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    await saga.applyEvent({ jobId: r.job.id, requestId: rows.get(r.job.id)!.provider_request_id!, status: 'in_progress' });
    expect(await saga.cancel(r.job.id, USER)).toEqual({ ok: false, code: 'cannot_cancel' });
    expect(ledger.state.balance).toBe(985);
  });

  test('another user cannot cancel (or even see) my job', async () => {
    const { saga } = setup();
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    expect(await saga.cancel(r.job.id, 'intruder')).toEqual({ ok: false, code: 'not_found' });
  });

  test('the sweeper polls a job whose webhook never came, and settles it', async () => {
    const { saga, rows, calls } = setup({ status: 'completed', outputs: ['https://cdn.higgsfield.ai/p.mp4'] });
    const r = await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL });
    if (!r.ok) throw new Error('create failed');
    clock += 5 * 60_000;
    const rep = await saga.sweep();
    expect(calls.status).toBe(1);
    expect(rep.finalized).toBe(1);
    expect(status(rows, r.job.id)).toBe('completed');
  });
});
