/** @jest-environment node */
/**
 * The studio billing saga, end to end over fakes: an in-memory store with the real table's semantics
 * (compare-and-set transitions, unique request ids, event dedupe), a scripted provider, a ledger that behaves
 * like deduct_credits / refund_credits, and a counting semaphore.
 *
 * The cases that matter most are the money ones: nothing charged without a confirmed price; a POST sent once
 * even when it times out; refunds that pay back exactly what was taken, once, whatever races happen.
 *
 * ⚠️ MyAvatar v32 (lib/providers/policy) retired Higgsfield, the only provider the registry knows. quote/create now refuse
 * every model before an estimate, a translation, a charge or a row — whatever HF_ENABLED_MODELS says — and production
 * has no adapter at all (createHiggsfieldAdapter → null). What still runs is the settling of jobs that were ALREADY in
 * flight at the cutover: those are seeded here exactly as the old create left them (row + debit + slot), and their
 * webhooks, refunds, cancels and sweeps must still pay back exactly what was taken, once.
 */
import { createStudioSaga, publicJob, type SagaDeps } from './saga';
import { ProviderError, type ProviderAdapter, type ProviderStatus } from '@/lib/providers/types';
import type { JobPatch, JobStatus, NewStudioJob, StoredOutput, StudioJob, StudioStore } from './store';
import { MODELS } from '@/lib/providers/registry';
import { isProviderPermitted } from '@/lib/providers/policy';
import { createHiggsfieldAdapter } from '@/lib/providers/higgsfield/adapter';
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
    async listForUser(userId, limit = 12) {
      return [...rows.values()].filter((r) => r.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map((r) => ({ ...r }));
    },
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

type Script = { usd?: number; describe?: string; submit?: () => Promise<{ requestId: string; status: ProviderStatus }>; status?: ProviderStatus; outputs?: string[]; cancel?: boolean; estimateError?: ProviderError };

function fakeProvider(script: Script = {}) {
  const calls = { estimate: 0, submit: 0, status: 0, cancel: 0, endpoints: [] as string[] };
  const provider: ProviderAdapter = {
    id: 'higgsfield',
    async estimate(endpoint) {
      calls.estimate++;
      if (script.estimateError) throw script.estimateError;
      if (script.describe !== undefined) return { usd: null, providerCredits: null, listUsd: null, pricingDescription: script.describe, correlationId: 'c-est' };
      const usd = endpoint.includes('/pro/') ? (script.usd ?? 0.4) * 2 : script.usd ?? 0.4;
      return { usd, providerCredits: 6, listUsd: usd, pricingDescription: null, correlationId: 'c-est' };
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

function setup(script: Script = {}, opts: { balance?: number; slots?: number; copy?: 'ok' | 'fail'; env?: Record<string, string>; provider?: null } = {}) {
  const { store, rows } = memoryStore();
  const ledger = fakeLedger(opts.balance);
  const sem = countingSemaphore(opts.slots);
  const { provider, calls } = fakeProvider(script);
  const alerts: string[] = [];
  const filed: string[] = [];
  const translations: string[] = [];
  let seq = 0;
  const deps: SagaDeps = {
    store,
    // `provider: null` is production's wiring under v32 (createHiggsfieldAdapter returns null whatever the env holds).
    provider: opts.provider === null ? null : provider,
    ledger: ledger.port,
    semaphore: sem,
    async copyOutputs(job, urls) {
      if (opts.copy === 'fail') return null;
      return urls.map((_, i): StoredOutput => ({ bucket: 'studio', path: `${job.user_id}/${job.id}/${i}.mp4`, contentType: 'video/mp4' }));
    },
    async fileInLibrary(job) { filed.push(job.id); },
    webhookUrlFor: (id) => `https://myavatar.ge/api/webhooks/higgsfield?job=${id}&sig=x`,
    alert: (m) => { alerts.push(m); },
    translatePrompt: async (t) => { translations.push(t); return 'Tbilisi at night, cinematic'; },
    now: () => clock,
    newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
    env: { HF_USD_GEL_RATE: '2.7', HF_GEL_MARGIN: '1.35', ...opts.env } as NodeJS.ProcessEnv,
  };
  return { saga: createStudioSaga(deps), rows, ledger, sem, calls, alerts, filed, store, translations };
}

const USER = 'user-1';
const T2V = { modelId: 'hf/kling-3-std-t2v', params: { prompt: 'თბილისი ღამით, კინემატოგრაფიული' } };
// 0.4 USD × 2.7 × 1.35 = 1.458 GEL → 15 credits → 1.50 GEL
const PRICE_GEL = 1.5;
const status = (rows: Map<string, StudioJob>, id: string): JobStatus => rows.get(id)!.status;

beforeEach(() => { clock = Date.parse('2026-09-29T10:00:00Z'); });

/**
 * A job that was already in flight when v32 retired Higgsfield, exactly as the old create left it: the row, the debit under
 * its ref and — once the provider had it — its concurrency slot. (quote/create cannot make one any more.)
 */
let legacySeq = 0;
async function seedLegacy(
  ctx: ReturnType<typeof setup>,
  patch: JobPatch & { status: JobStatus },
  opts: { model?: 'std' | 'pro'; debited?: boolean } = {},
): Promise<string> {
  const id = `00000000-0000-4000-9000-${String(++legacySeq).padStart(12, '0')}`;
  const pro = opts.model === 'pro';
  const job: NewStudioJob = {
    id, user_id: USER, service: 'video', provider: 'higgsfield',
    model_id: pro ? 'hf/kling-3-pro-t2v' : T2V.modelId,
    provider_endpoint: pro ? 'kling-video/v3.0/pro/text-to-video' : 'kling-video/v3.0/std/text-to-video',
    input: { prompt: 'Tbilisi at night, cinematic' }, prompt_original: T2V.params.prompt,
    estimate_provider_credits: 6, estimate_usd: pro ? 0.8 : 0.4, estimate_gel: pro ? 3 : PRICE_GEL,
    charge_credits: pro ? 30 : 15, charge_ref: `studio:${id}`,
  };
  await ctx.store.insert(job);
  if (opts.debited ?? true) expect(await ctx.ledger.port.deduct(USER, job.charge_credits, job.charge_ref)).toEqual({ ok: true });
  await ctx.store.patch(id, { submitted_at: iso(clock), next_poll_at: iso(clock + 2 * 60_000), ...patch });
  if (['submitting', 'submit_unknown', 'queued', 'in_progress'].includes(patch.status)) await ctx.sem.acquire(id, 60_000);
  return id;
}

const EVERY_MODEL = MODELS.map((m) => m.id).join(',');
const LIVE = 'For 16:9 video without video input, your request costs roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p. Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p.';
const OUT = ['https://cdn.higgsfield.ai/out.mp4'];

/* ─── v32: nothing new starts ──────────────────────────────────────────────────────────────── */

describe('v32: no Higgsfield job can be started — no estimate, translation, charge, row or POST', () => {
  test('every registered model is a retired provider\'s, and quote refuses each one even where HF_ENABLED_MODELS names it', async () => {
    const { saga, calls } = setup({}, { env: { HF_ENABLED_MODELS: EVERY_MODEL } });
    expect(MODELS.length).toBeGreaterThan(0);
    for (const m of MODELS) {
      expect(isProviderPermitted(m.provider)).toBe(false);
      expect(await saga.quote(m.id, { prompt: 'x' })).toEqual({ ok: false, code: 'model_unavailable' });
    }
    expect(calls.estimate).toBe(0);
  });

  test.each<[string, Script, { modelId: string; params: Record<string, unknown>; confirmedGel?: number }]>([
    ['without a confirmed price (was: confirmation_required)', {}, { ...T2V }],
    ['at the price the old quote showed (was: 15 credits charged and a POST)', {}, { ...T2V, confirmedGel: PRICE_GEL }],
    ['at a stale price (was: price_changed)', {}, { ...T2V, confirmedGel: 1.2 }],
    ['with invalid params (was: invalid_input)', {}, { modelId: T2V.modelId, params: { prompt: 'x', duration: 99 }, confirmedGel: PRICE_GEL }],
    ['for a model priced from the provider\'s description (was: Seedance at 85 credits)', { describe: LIVE }, { modelId: 'hf/seedance-2.5-t2v', params: { prompt: 'ზღვა', duration: 5, resolution: '720p', aspect_ratio: '16:9' }, confirmedGel: 8.5 }],
    ['for an image model (was: translated as an image)', {}, { modelId: 'hf/soul-2', params: { prompt: 'წითელი ვაშლი' }, confirmedGel: 1 }],
  ])('create %s → model_unavailable', async (_name, script, req) => {
    const ctx = setup(script, { env: { HF_ENABLED_MODELS: EVERY_MODEL } });
    expect(await ctx.saga.create({ userId: USER, ...req })).toEqual({ ok: false, code: 'model_unavailable' });
    expect(ctx.calls).toMatchObject({ estimate: 0, submit: 0, status: 0, cancel: 0 });
    expect(ctx.translations).toEqual([]);
    expect(ctx.ledger.entries).toEqual([]);
    expect(ctx.rows.size).toBe(0);
  });

  test('the refusal comes before the ledger: a short balance or a ledger error leaves no failed row and no entry (was: insufficient_credits / billing_unavailable)', async () => {
    const short = setup({}, { balance: 5, env: { HF_ENABLED_MODELS: EVERY_MODEL } });
    expect(await short.saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL })).toEqual({ ok: false, code: 'model_unavailable' });
    expect(short.rows.size).toBe(0);
    expect(short.ledger.state.balance).toBe(5);
    const broken = setup({}, { env: { HF_ENABLED_MODELS: EVERY_MODEL } });
    broken.ledger.state.deductMode = 'error-after-commit';
    expect(await broken.saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL })).toEqual({ ok: false, code: 'model_unavailable' });
    expect(broken.ledger.entries).toEqual([]);
    expect(broken.ledger.state.balance).toBe(1000);
  });

  test('an unknown or disabled model is refused before anything else', async () => {
    const { saga, calls } = setup();
    expect(await saga.create({ userId: USER, modelId: 'hf/nope', params: {}, confirmedGel: 1 })).toMatchObject({ ok: false, code: 'model_unavailable' });
    // A Nano Banana / Veo pick is a catalogue model but never a Higgsfield one: the saga cannot be talked into running it.
    expect(await saga.create({ userId: USER, modelId: 'nb/pro', params: { prompt: 'x' }, confirmedGel: 1 })).toMatchObject({ ok: false, code: 'model_unavailable' });
    expect(calls.estimate).toBe(0);
  });

  test('a registered model this deployment did not enable (HF_ENABLED_MODELS) is refused before an estimate or a charge', async () => {
    const { saga, calls, ledger } = setup({}, { env: { HF_ENABLED_MODELS: 'hf/soul-2' } });
    expect(await saga.create({ userId: USER, ...T2V, confirmedGel: PRICE_GEL })).toMatchObject({ ok: false, code: 'model_unavailable' });
    expect(calls.estimate).toBe(0);
    expect(calls.submit).toBe(0);
    expect(ledger.entries).toEqual([]);
  });

  test('production has no adapter, whatever the env holds — the saga is built with provider: null and quotes nothing', async () => {
    expect(createHiggsfieldAdapter({ HF_API_KEY: 'test-key', HF_API_SECRET: 'test-secret', HF_ENABLED_MODELS: EVERY_MODEL } as NodeJS.ProcessEnv)).toBeNull();
    const { saga } = setup({}, { provider: null, env: { HF_ENABLED_MODELS: EVERY_MODEL } });
    expect(await saga.quote(T2V.modelId, T2V.params)).toEqual({ ok: false, code: 'not_configured' });
  });
});

/* ─── legacy jobs: the happy path ──────────────────────────────────────────────────────────── */

describe('a legacy job still settles', () => {
  test('queued → in_progress → completed webhook → finalize → our storage, settled at the confirmed price, filed', async () => {
    const ctx = setup();
    const { saga, rows, ledger, calls, sem, filed } = ctx;
    const id = await seedLegacy(ctx, { status: 'queued', provider_request_id: 'req-legacy-std-0001' });
    expect(ledger.entries).toEqual([{ ref: `studio:${id}`, delta: -15 }]);
    expect(sem.held.has(id)).toBe(true);

    await saga.applyEvent({ jobId: id, requestId: 'req-legacy-std-0001', status: 'in_progress' });
    expect(status(rows, id)).toBe('in_progress');

    await saga.applyEvent({ jobId: id, requestId: 'req-legacy-std-0001', status: 'completed', outputUrls: OUT });
    expect(status(rows, id)).toBe('finalizing');
    expect(sem.held.has(id)).toBe(false); // the provider slot frees as soon as the provider is done

    const done = await saga.finalize(rows.get(id)!);
    expect(done.status).toBe('completed');
    expect(done.output_urls).toEqual([{ bucket: 'studio', path: `${USER}/${id}/0.mp4`, contentType: 'video/mp4' }]);
    expect(done.charged_gel).toBe(1.5);
    expect(filed).toEqual([id]);
    expect(ledger.state.balance).toBe(1000 - 15);
    expect(calls.submit).toBe(0);
    // and the user-facing view carries no provider id, endpoint or internal error text — but both prompts (§7)
    expect(Object.keys(publicJob(done, ['https://signed']))).not.toEqual(expect.arrayContaining(['provider_request_id', 'provider_endpoint', 'error_detail']));
    expect(publicJob(done)).toMatchObject({ promptOriginal: 'თბილისი ღამით, კინემატოგრაფიული', promptSent: 'Tbilisi at night, cinematic' });
  });

  test('a finalize whose copy fails stays finalizing (retried later) — the user is never handed a provider URL', async () => {
    const ctx = setup({}, { copy: 'fail' });
    const id = await seedLegacy(ctx, { status: 'queued', provider_request_id: 'req-legacy-std-0002' });
    await ctx.saga.applyEvent({ jobId: id, requestId: 'req-legacy-std-0002', status: 'completed', outputUrls: ['https://cdn.higgsfield.ai/o.mp4'] });
    const j = await ctx.saga.finalize(ctx.rows.get(id)!);
    expect(j.status).toBe('finalizing');
    expect(publicJob(j).outputUrls).toEqual([]);
  });
});

/* ─── the POST is sent once ────────────────────────────────────────────────────────────────── */

describe('a generation POST is never repeated', () => {
  test('a legacy submit_unknown (its POST timed out) is never re-POSTed; the webhook (job id in its URL) reconciles it', async () => {
    const ctx = setup();
    const { saga, rows, calls, ledger } = ctx;
    const id = await seedLegacy(ctx, { status: 'submit_unknown', error_code: 'timeout' });
    clock += 3 * 60_000;
    await saga.sweep();
    expect(calls.submit).toBe(0);
    expect(ledger.state.balance).toBe(985); // still reserved — the request may be running
    await saga.applyEvent({ jobId: id, requestId: 'late-request-123456', status: 'completed', outputUrls: ['https://cdn.higgsfield.ai/x.mp4'] });
    expect(rows.get(id)!.provider_request_id).toBe('late-request-123456');
    expect(status(rows, id)).toBe('finalizing');
  });

  test('an unreconciled submit_unknown is refunded after the model’s window — and still never re-POSTed', async () => {
    const ctx = setup();
    const id = await seedLegacy(ctx, { status: 'submit_unknown', error_code: 'network' });
    clock += 21 * 60_000; // Kling std window is 20 min
    const rep = await ctx.saga.sweep();
    expect(rep.unknownExpired).toBe(1);
    expect(status(ctx.rows, id)).toBe('failed');
    expect(ctx.ledger.state.balance).toBe(1000);
    expect(ctx.calls.submit).toBe(0);
    expect(ctx.alerts).toContain('hf_submit_unreconciled');
    expect(ctx.sem.held.has(id)).toBe(false);
  });

  test('a crash mid-POST (row left `submitting`) is treated as ambiguous, not resubmitted', async () => {
    const ctx = setup();
    const id = await seedLegacy(ctx, { status: 'submitting', attempts: 1 });
    clock += 3 * 60_000;
    const rep = await ctx.saga.sweep();
    expect(rep.submittingToUnknown).toBe(1);
    expect(status(ctx.rows, id)).toBe('submit_unknown');
    expect(ctx.calls.submit).toBe(0);
  });
});

/* ─── refunds ──────────────────────────────────────────────────────────────────────────────── */

describe('refunds pay back exactly what was taken, once', () => {
  test('failed → refunded in full; a duplicate failed event and a racing poll refund nothing more', async () => {
    const ctx = setup({ status: 'failed' });
    const { saga, rows, ledger, sem } = ctx;
    const id = await seedLegacy(ctx, { status: 'queued', provider_request_id: 'req-legacy-fail-01' });
    await saga.applyEvent({ jobId: id, requestId: 'req-legacy-fail-01', status: 'failed', error: 'Generation failed' });
    await saga.applyEvent({ jobId: id, requestId: 'req-legacy-fail-01', status: 'failed', error: 'Generation failed' });
    clock += 10 * 60_000;
    await saga.sweep();
    expect(status(rows, id)).toBe('failed');
    expect(rows.get(id)!.refund_state).toBe('done');
    expect(ledger.entries.filter((e) => e.delta > 0)).toEqual([{ ref: `studio:${id}:refund`, delta: 15 }]);
    expect(ledger.state.balance).toBe(1000);
    expect(sem.held.has(id)).toBe(false);
  });

  test('nsfw → refunded, coded content_rejected (the UI says why and that the money came back)', async () => {
    const ctx = setup();
    const id = await seedLegacy(ctx, { status: 'queued', provider_request_id: 'req-legacy-nsfw-1' });
    await ctx.saga.applyEvent({ jobId: id, requestId: 'req-legacy-nsfw-1', status: 'nsfw' });
    expect(ctx.rows.get(id)).toMatchObject({ status: 'nsfw', error_code: 'content_rejected', refund_state: 'done' });
    expect(ctx.ledger.state.balance).toBe(1000);
  });

  test('completed with no outputs is a failure, refunded', async () => {
    const ctx = setup();
    const id = await seedLegacy(ctx, { status: 'in_progress', provider_request_id: 'req-legacy-empty1' });
    await ctx.saga.applyEvent({ jobId: id, requestId: 'req-legacy-empty1', status: 'completed', outputUrls: [] });
    expect(status(ctx.rows, id)).toBe('failed');
    expect(ctx.ledger.state.balance).toBe(1000);
  });

  test('the ledger, not the crash, decides: a row stuck in `reserving` refunds what was debited — and nothing where nothing was', async () => {
    const ctx = setup();
    const debited = await seedLegacy(ctx, { status: 'reserving' });
    const never = await seedLegacy(ctx, { status: 'reserving' }, { debited: false });
    expect(ctx.ledger.state.balance).toBe(985);
    clock += 6 * 60_000;
    const rep = await ctx.saga.sweep();
    expect(rep.reservingRecovered).toBe(2);
    expect(ctx.rows.get(debited)).toMatchObject({ status: 'failed', error_code: 'billing_unavailable', refund_state: 'done', refunded_credits: 15 });
    expect(ctx.rows.get(never)).toMatchObject({ status: 'failed', refund_state: 'nothing_to_refund', refunded_credits: 0 });
    expect(ctx.ledger.state.balance).toBe(1000);
    expect(ctx.calls.submit).toBe(0);
  });

  test('a refund that fails to land is retried by the sweeper, exactly once when it does', async () => {
    const ctx = setup();
    const { saga, rows, ledger } = ctx;
    const id = await seedLegacy(ctx, { status: 'queued', provider_request_id: 'req-legacy-retry1' });
    const realRefund = ledger.port.refundByRef;
    ledger.port.refundByRef = async () => ({ ok: false, refunded: 0, reason: 'error' });
    await saga.applyEvent({ jobId: id, requestId: 'req-legacy-retry1', status: 'failed' });
    expect(rows.get(id)!.refund_state).toBe('pending');
    ledger.port.refundByRef = realRefund;
    await saga.sweep();
    await saga.sweep();
    expect(rows.get(id)!.refund_state).toBe('done');
    expect(ledger.state.balance).toBe(1000);
  });
});

/* ─── v32: a job still waiting for a slot ──────────────────────────────────────────────────── */

describe('v32: a legacy job still waiting for a slot is refunded in full, never sent', () => {
  test('production wiring (no adapter): the sweeper settles every reserved/pending job as a refund — no request leaves, no fallback stands in', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }));
    try {
      const ctx = setup({}, { provider: null });
      const pending = await seedLegacy(ctx, { status: 'pending' }, { model: 'pro' }); // the old concurrency-400 path left it here
      const reserved = await seedLegacy(ctx, { status: 'reserved' });
      expect(ctx.ledger.state.balance).toBe(1000 - 30 - 15);
      const rep = await ctx.saga.sweep();
      expect(rep.drained).toBe(2);
      for (const id of [pending, reserved]) expect(ctx.rows.get(id)).toMatchObject({ status: 'failed', error_code: 'not_configured', refund_state: 'done' });
      expect(ctx.rows.get(pending)!.model_id).toBe('hf/kling-3-pro-t2v'); // the same-family std fallback did not stand in
      expect(ctx.ledger.state.balance).toBe(1000);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('cancel before the provider had it → full refund, without asking the provider', async () => {
    const ctx = setup();
    const id = await seedLegacy(ctx, { status: 'pending' });
    const c = await ctx.saga.cancel(id, USER);
    expect(c.ok).toBe(true);
    expect(ctx.calls.cancel).toBe(0);
    expect(ctx.rows.get(id)).toMatchObject({ status: 'canceled', refund_state: 'done' });
    expect(ctx.ledger.state.balance).toBe(1000);
  });
});

/* ─── events and cancel ────────────────────────────────────────────────────────────────────── */

describe('events and cancel', () => {
  test('an event naming a different request id for the job is ignored', async () => {
    const ctx = setup();
    const id = await seedLegacy(ctx, { status: 'queued', provider_request_id: 'req-legacy-mine-01' });
    const res = await ctx.saga.applyEvent({ jobId: id, requestId: 'someone-elses-request', status: 'failed' });
    expect(res).toMatchObject({ applied: false, reason: 'request_mismatch' });
    expect(status(ctx.rows, id)).toBe('queued');
    expect(ctx.ledger.state.balance).toBe(985);
    expect(ctx.alerts).toContain('hf_event_request_mismatch');
  });

  test('cancel while queued at the provider: refunded in full where the provider confirms it; refused (credits kept for the webhook) where production has no adapter to ask', async () => {
    const withAdapter = setup({ cancel: true });
    const a = await seedLegacy(withAdapter, { status: 'queued', provider_request_id: 'req-legacy-cancel1' });
    expect((await withAdapter.saga.cancel(a, USER)).ok).toBe(true);
    expect(withAdapter.calls.cancel).toBe(1);
    expect(withAdapter.rows.get(a)).toMatchObject({ status: 'canceled', refund_state: 'done' });
    expect(withAdapter.ledger.state.balance).toBe(1000);

    const production = setup({}, { provider: null });
    const b = await seedLegacy(production, { status: 'queued', provider_request_id: 'req-legacy-cancel2' });
    expect(await production.saga.cancel(b, USER)).toEqual({ ok: false, code: 'cannot_cancel' });
    expect(status(production.rows, b)).toBe('queued');
    expect(production.ledger.state.balance).toBe(985);
  });

  test('cancel once the provider started → refused, nothing refunded', async () => {
    const ctx = setup();
    const id = await seedLegacy(ctx, { status: 'in_progress', provider_request_id: 'req-legacy-start1' });
    expect(await ctx.saga.cancel(id, USER)).toEqual({ ok: false, code: 'cannot_cancel' });
    expect(ctx.ledger.state.balance).toBe(985);
  });

  test('another user cannot cancel (or even see) my job', async () => {
    const ctx = setup();
    const id = await seedLegacy(ctx, { status: 'queued', provider_request_id: 'req-legacy-other1' });
    expect(await ctx.saga.cancel(id, 'intruder')).toEqual({ ok: false, code: 'not_found' });
  });

  test('the sweeper polls a job whose webhook never came, and settles it; with no adapter (production) it polls nothing', async () => {
    const ctx = setup({ status: 'completed', outputs: ['https://cdn.higgsfield.ai/p.mp4'] });
    const id = await seedLegacy(ctx, { status: 'queued', provider_request_id: 'req-legacy-poll01' });
    clock += 5 * 60_000;
    const rep = await ctx.saga.sweep();
    expect(ctx.calls.status).toBe(1);
    expect(rep.finalized).toBe(1);
    expect(status(ctx.rows, id)).toBe('completed');

    const production = setup({}, { provider: null });
    const p = await seedLegacy(production, { status: 'queued', provider_request_id: 'req-legacy-poll02' });
    clock += 5 * 60_000;
    expect((await production.saga.sweep()).polled).toBe(0);
    expect(status(production.rows, p)).toBe('queued');
  });
});
