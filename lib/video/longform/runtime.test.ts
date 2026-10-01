/** @jest-environment node */
/**
 * runtime.ts — the production adapters, with every server module mocked (no Supabase, no Veo, no ledger, no network).
 * Rules under test: an act reservation is idempotent by reading the ledger first; a scene refund is skipped when its
 * ref already landed and is capped by what the act debit has left; the store throws on supabase-js `{ error }` (it
 * never throws itself); the engine submits inside the budget guard at the capabilities price and maps a budget
 * refusal; delivery hosts at a path fixed per operation and re-signs instead of re-uploading; the finisher files the
 * film in the Library under a prefixed id with its storage path, and deletes only this job's scene media.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));
jest.mock('../../orchestrator/ledger', () => ({ deductCredits: jest.fn(), netDebitedForRef: jest.fn(), refundCredits: jest.fn() }));
jest.mock('../../orchestrator/storage-adapter', () => ({ createSignedAssetUrl: jest.fn(), uploadBufferAndSign: jest.fn() }));
jest.mock('../../services/billing/guardedCall', () => {
  class BudgetExceededError extends Error {
    readonly reason: string;
    constructor(reason: string) {
      super(`budget_exceeded:${reason}`);
      this.reason = reason;
    }
  }
  return { BudgetExceededError, guardedCall: jest.fn() };
});
jest.mock('../../veo/engine', () => ({ createVeoClip: jest.fn(), pollVeoClip: jest.fn(), veoTransport: jest.fn() }));
jest.mock('../../veo/deliver', () => ({ hostGcsVideo: jest.fn() }));
jest.mock('../../veo/geminiTransport', () => ({ downloadGeminiVideo: jest.fn() }));
jest.mock('../../ai/llmText', () => ({ llmText: jest.fn() }));
jest.mock('../../orchestrator/jobs', () => ({ recordCompletedFilm: jest.fn() }));

import { deductCredits, netDebitedForRef, refundCredits } from '@/lib/orchestrator/ledger';
import { createSignedAssetUrl, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { BudgetExceededError, guardedCall } from '@/lib/services/billing/guardedCall';
import { pollVeoClip, veoTransport } from '@/lib/veo/engine';
import { hostGcsVideo } from '@/lib/veo/deliver';
import { downloadGeminiVideo } from '@/lib/veo/geminiTransport';
import type { CreateVeoClipInput } from '@/lib/veo/engine';
import { recordCompletedFilm } from '@/lib/orchestrator/jobs';
import { llmText } from '@/lib/ai/llmText';
import {
  createLedgerLongformBilling,
  createLongformFinisher,
  createLongformTickDeps,
  createSupabaseLongformStore,
  createVeoLongformEngine,
  llmDirectorGenerate,
  longformLibraryId,
  seedFramePath,
} from './runtime';
import { makeJob } from './testing/tickFakes';

const m = <T extends (...a: never[]) => unknown>(f: T) => f as unknown as jest.Mock;

/** A supabase-js double: every chain resolves to `result`; calls are recorded. */
function fakeSvc(result: { data?: unknown; error?: { message: string } | null } = { data: [], error: null }) {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'gt', 'limit', 'order', 'update']) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    };
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve);
  const svc = {
    from: (table: string) => { calls.push({ op: 'from', args: [table] }); return chain; },
    rpc: async (fn: string, args: unknown) => { calls.push({ op: 'rpc', args: [fn, args] }); return { data: result.data ?? null, error: result.error ?? null }; },
  };
  return { svc: svc as never, calls };
}

beforeEach(() => jest.clearAllMocks());

describe('billing — reserve per act', () => {
  const billing = () => createLedgerLongformBilling(fakeSvc().svc);

  test('first reservation debits the act under its ref', async () => {
    m(netDebitedForRef).mockResolvedValue(0);
    m(deductCredits).mockResolvedValue({ ok: true });
    expect(await billing().reserveAct('u1', 'longform:j1:act:0', 273)).toBe('ok');
    expect(deductCredits).toHaveBeenCalledWith('u1', 273, 'longform:j1:act:0');
  });

  test('a retried reservation finds the debit in the ledger and does NOT debit again', async () => {
    m(netDebitedForRef).mockResolvedValue(273);
    expect(await billing().reserveAct('u1', 'longform:j1:act:0', 156)).toBe('ok');
    expect(deductCredits).not.toHaveBeenCalled();
  });

  test('insufficient → insufficient; a ledger miss, a skipped RPC or an unreadable ledger → unavailable', async () => {
    m(netDebitedForRef).mockResolvedValue(0);
    m(deductCredits).mockResolvedValueOnce({ ok: false, reason: 'insufficient' });
    expect(await billing().reserveAct('u1', 'r', 10)).toBe('insufficient');
    m(deductCredits).mockResolvedValueOnce({ ok: false, reason: 'skipped' });
    expect(await billing().reserveAct('u1', 'r', 10)).toBe('unavailable'); // never a free render on a missing RPC
    m(deductCredits).mockResolvedValueOnce({ ok: false, reason: 'error' });
    expect(await billing().reserveAct('u1', 'r', 10)).toBe('unavailable');
    m(netDebitedForRef).mockResolvedValueOnce(null);
    expect(await billing().reserveAct('u1', 'r', 10)).toBe('unavailable');
  });

  test('a zero-credit act needs no ledger at all', async () => {
    expect(await billing().reserveAct('u1', 'r', 0)).toBe('ok');
    expect(netDebitedForRef).not.toHaveBeenCalled();
  });
});

describe('billing — refund per scene', () => {
  test('refunds the scene share under its own ref', async () => {
    const { svc } = fakeSvc({ data: [] }); // no credit under the refund ref yet
    m(netDebitedForRef).mockResolvedValue(273);
    m(refundCredits).mockResolvedValue({ ok: true });
    expect(await createLedgerLongformBilling(svc).refundScene('u1', 'longform:j1:act:0', 39, 'longform:j1:act:0:s2:refund')).toBe(true);
    expect(refundCredits).toHaveBeenCalledWith('u1', 39, 'longform:j1:act:0:s2:refund');
  });

  test('an already-landed refund is not paid twice', async () => {
    const { svc, calls } = fakeSvc({ data: [{ delta: 39 }] });
    expect(await createLedgerLongformBilling(svc).refundScene('u1', 'c', 39, 'c:s2:refund')).toBe(true);
    expect(refundCredits).not.toHaveBeenCalled();
    expect(calls).toEqual(expect.arrayContaining([{ op: 'from', args: ['credit_ledger'] }, { op: 'eq', args: ['metadata->>ref', 'c:s2:refund'] }, { op: 'gt', args: ['delta', 0] }]));
  });

  test('capped by what the act debit has left; nothing left = done; unreadable = retry later', async () => {
    const { svc } = fakeSvc({ data: [] });
    const b = createLedgerLongformBilling(svc);
    m(refundCredits).mockResolvedValue({ ok: true });
    m(netDebitedForRef).mockResolvedValueOnce(20);
    expect(await b.refundScene('u1', 'c', 39, 'c:s1:refund')).toBe(true);
    expect(refundCredits).toHaveBeenLastCalledWith('u1', 20, 'c:s1:refund');
    m(netDebitedForRef).mockResolvedValueOnce(0);
    expect(await b.refundScene('u1', 'c', 39, 'c:s3:refund')).toBe(true);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    m(netDebitedForRef).mockResolvedValueOnce(null);
    expect(await b.refundScene('u1', 'c', 39, 'c:s4:refund')).toBe(false);
    const broken = fakeSvc({ error: { message: 'down' } });
    expect(await createLedgerLongformBilling(broken.svc).refundScene('u1', 'c', 39, 'c:s5:refund')).toBe(false);
  });
});

describe('store', () => {
  test('claimJobs calls the claim function and maps rows', async () => {
    const { svc, calls } = fakeSvc({ data: [{ id: 'j1', user_id: 'u1', status: 'planned', act_count: 1, deadline_at: '2027-01-01T00:00:00.000Z' }] });
    const jobs = await createSupabaseLongformStore(svc).claimJobs(5, 110);
    expect(calls[0]).toEqual({ op: 'rpc', args: ['claim_longform_jobs', { p_limit: 5, p_lease_seconds: 110 }] });
    expect(jobs[0]).toMatchObject({ id: 'j1', userId: 'u1', status: 'planned', deadlineAt: Date.parse('2027-01-01T00:00:00.000Z') });
  });

  test('claimScenes maps the claimed rows', async () => {
    const { svc, calls } = fakeSvc({ data: [{ ordinal: 3, attempts: 1, submitted_at: '2027-01-01T00:00:00.000Z', status: 'submitted' }] });
    expect(await createSupabaseLongformStore(svc).claimScenes('j1', [3])).toEqual([{ ordinal: 3, attempts: 1, submittedAt: Date.parse('2027-01-01T00:00:00.000Z') }]);
    expect(calls[0]).toEqual({ op: 'rpc', args: ['claim_longform_scenes', { p_job_id: 'j1', p_ordinals: [3] }] });
  });

  test('a supabase {error} is THROWN (supabase-js never throws on its own)', async () => {
    const { svc } = fakeSvc({ error: { message: 'permission denied' } });
    const store = createSupabaseLongformStore(svc);
    await expect(store.claimJobs(1, 60)).rejects.toThrow('claim_longform_jobs: permission denied');
    await expect(store.patchScene('j1', 2, { status: 'failed' })).rejects.toThrow('update scene 2: permission denied');
    await expect(store.patchJob('j1', { status: 'done' })).rejects.toThrow('update longform_jobs: permission denied');
    await expect(store.loadScenes('j1')).rejects.toThrow('load longform_scenes');
  });

  test('patches write mapped columns scoped to the job + ordinal; an empty patch writes nothing', async () => {
    const { svc, calls } = fakeSvc();
    const store = createSupabaseLongformStore(svc);
    await store.patchScene('j1', 2, { status: 'rendering', operation: 'op' });
    expect(calls).toEqual([
      { op: 'from', args: ['longform_scenes'] },
      { op: 'update', args: [{ status: 'rendering', operation_name: 'op' }] },
      { op: 'eq', args: ['job_id', 'j1'] },
      { op: 'eq', args: ['ordinal', 2] },
    ]);
    calls.length = 0;
    await store.patchScene('j1', 2, {});
    expect(calls).toEqual([]);
  });
});

describe('engine adapter', () => {
  const input: CreateVeoClipInput = { request: { prompt: 'p', aspect: '16:9', durationSec: 8, generateAudio: true }, tier: 'fast', sessionId: 'longform-j1', ordinal: 0 };
  const ctx = { userId: 'u1', jobId: 'j1', ordinal: 0 };

  test('submit runs inside the budget guard at the capabilities price (8 s × Fast 1080p $0.12)', async () => {
    m(veoTransport).mockReturnValue('gemini');
    m(guardedCall).mockResolvedValue({ outcome: { ok: true, operation: { transport: 'gemini', name: 'models/x/operations/1', model: 'm' } }, transport: 'gemini', model: 'veo-3.1-fast-generate-preview' });
    const r = await createVeoLongformEngine().submit(input, ctx);
    expect(r).toEqual({ report: { kind: 'outcome', outcome: { ok: true, operation: { transport: 'gemini', name: 'models/x/operations/1', model: 'm' } } }, transport: 'gemini', model: 'veo-3.1-fast-generate-preview' });
    expect(m(guardedCall).mock.calls[0]?.[0]).toMatchObject({ service: 'video', model: 'veo-3.1-fast-generate-preview', units: 8, unitCostUsd: 0.12, userId: 'u1' });
  });

  test('a budget refusal becomes budget_refused; any other throw propagates (→ ambiguous in the tick)', async () => {
    m(veoTransport).mockReturnValue('gemini');
    m(guardedCall).mockRejectedValueOnce(new (BudgetExceededError as unknown as new (r: string) => Error)('daily_limit'));
    expect(await createVeoLongformEngine().submit(input, ctx)).toEqual({ report: { kind: 'budget_refused', reason: 'daily_limit' } });
    m(guardedCall).mockRejectedValueOnce(new Error('socket'));
    await expect(createVeoLongformEngine().submit(input, ctx)).rejects.toThrow('socket');
  });

  test('poll: processing / filtered / failed pass through', async () => {
    const e = createVeoLongformEngine();
    m(pollVeoClip).mockResolvedValueOnce({ state: 'processing' });
    expect(await e.poll('op', ctx)).toEqual({ state: 'processing' });
    m(pollVeoClip).mockResolvedValueOnce({ state: 'filtered', reason: 'celebrity', supportCodes: [] });
    expect(await e.poll('op', ctx)).toEqual({ state: 'filtered', reason: 'celebrity' });
    m(pollVeoClip).mockResolvedValueOnce({ state: 'failed', reason: 'internal' });
    expect(await e.poll('op', ctx)).toEqual({ state: 'failed', reason: 'internal' });
    m(pollVeoClip).mockResolvedValueOnce({ state: 'succeeded', videos: [] });
    expect((await e.poll('op', ctx)).state).toBe('failed');
  });

  test('a Vertex clip is copied into Supabase at a path fixed per operation', async () => {
    m(pollVeoClip).mockResolvedValue({ state: 'succeeded', videos: [{ kind: 'gcs', gcsUri: 'gs://b/o.mp4', mimeType: 'video/mp4' }] });
    m(hostGcsVideo).mockResolvedValue('https://sb/signed.mp4');
    const a = await createVeoLongformEngine().poll('projects/p/operations/1', { ...ctx, ordinal: 7 });
    const b = await createVeoLongformEngine().poll('projects/p/operations/1', { ...ctx, ordinal: 7 });
    expect(a).toMatchObject({ state: 'delivered', url: 'https://sb/signed.mp4' });
    expect(a.state === 'delivered' && a.path).toMatch(/^longform\/j1\/s07-[0-9a-f]{16}\.mp4$/);
    expect(b.state === 'delivered' && b.path).toBe(a.state === 'delivered' ? a.path : '');
    m(hostGcsVideo).mockResolvedValue(null);
    expect(await createVeoLongformEngine().poll('projects/p/operations/1', ctx)).toEqual({ state: 'undeliverable' });
  });

  test('a Gemini file: an already-hosted copy is re-signed (no download); otherwise downloaded and hosted with its size', async () => {
    m(pollVeoClip).mockResolvedValue({ state: 'succeeded', videos: [{ kind: 'gemini-file', uri: 'https://generativelanguage.googleapis.com/v1/files/x', mimeType: 'video/mp4' }] });
    m(createSignedAssetUrl).mockResolvedValueOnce('https://sb/existing.mp4');
    expect(await createVeoLongformEngine().poll('models/m/operations/1', ctx)).toMatchObject({ state: 'delivered', url: 'https://sb/existing.mp4' });
    expect(downloadGeminiVideo).not.toHaveBeenCalled();

    m(createSignedAssetUrl).mockResolvedValueOnce(null);
    m(downloadGeminiVideo).mockResolvedValueOnce(Buffer.alloc(5_000));
    m(uploadBufferAndSign).mockResolvedValueOnce('https://sb/new.mp4');
    expect(await createVeoLongformEngine().poll('models/m/operations/1', ctx)).toMatchObject({ state: 'delivered', url: 'https://sb/new.mp4', bytes: 5_000 });
    expect(m(uploadBufferAndSign).mock.calls[0]?.slice(0, 1)).toEqual(['renders']);

    m(createSignedAssetUrl).mockResolvedValueOnce(null);
    m(downloadGeminiVideo).mockResolvedValueOnce(null);
    expect(await createVeoLongformEngine().poll('models/m/operations/1', ctx)).toEqual({ state: 'undeliverable' });
  });

  test('extractLastFrame refuses a non-public or non-https clip without running anything', async () => {
    const e = createVeoLongformEngine();
    expect(await e.extractLastFrame('http://cdn/x.mp4', ctx)).toBeNull();
    expect(await e.extractLastFrame('https://169.254.169.254/latest/meta-data', ctx)).toBeNull();
    expect(uploadBufferAndSign).not.toHaveBeenCalled();
  });
});

describe('finisher — the Library and the scene media', () => {
  const JOB = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const film = { url: `https://x.supabase.co/storage/v1/object/sign/renders/longform/${JOB}/film.mp4?token=t`, path: `longform/${JOB}/film.mp4`, bytes: 40_000_000 };

  test('files the film through recordCompletedFilm (service role) under a PREFIXED id, keeping bucket + path', async () => {
    m(recordCompletedFilm).mockResolvedValue(true);
    const fin = createLongformFinisher(fakeSvc().svc);
    expect(await fin.fileFilm(makeJob({ id: JOB, userId: 'u1', format: '9:16', sceneCount: 13, prompt: 'p'.repeat(900) }), film)).toBe(true);
    expect(recordCompletedFilm).toHaveBeenCalledWith({
      id: `longform_${JOB}`,
      userId: 'u1',
      url: film.url,
      prompt: 'p'.repeat(500),
      orientation: 'vertical',
      result: { url: film.url, bucket: 'renders', path: film.path, bytes: 40_000_000, longformJobId: JOB, seconds: 104 },
      subtype: 'longform',
    });
    expect(longformLibraryId(JOB)).toBe(`longform_${JOB}`);
    m(recordCompletedFilm).mockResolvedValue(false);
    expect(await fin.fileFilm(makeJob({ id: JOB }), film)).toBe(false);
  });

  function storageSvc(error: { message: string } | null = null) {
    const removed: Array<{ bucket: string; paths: string[] }> = [];
    const svc = { storage: { from: (bucket: string) => ({ remove: async (paths: string[]) => { removed.push({ bucket, paths }); return { data: null, error }; } }) } };
    return { svc: svc as never, removed };
  }

  test('removes this job\'s clips and seed frames — never the film, never another folder, never a climbing path', async () => {
    const { svc, removed } = storageSvc();
    await createLongformFinisher(svc).removeSceneMedia(makeJob({ id: JOB }), {
      clipPaths: [`longform/${JOB}/s00-ab.mp4`, `longform/${JOB}/s01-cd.mp4`, `longform/${JOB}/film.mp4`, 'longform/other-job/s00.mp4', `longform/${JOB}/../other/x.mp4`, 'avatars/u1/me.png', `longform/${JOB}/s00-ab.mp4`],
      seedOrdinals: [7],
      filmPath: film.path,
    });
    expect(removed).toEqual([{ bucket: 'renders', paths: [`longform/${JOB}/s00-ab.mp4`, `longform/${JOB}/s01-cd.mp4`, `longform/${JOB}/seed-07.jpg`] }]);
    expect(seedFramePath(JOB, 7)).toBe(`longform/${JOB}/seed-07.jpg`);
  });

  test('the production tick deps carry the finisher (the tick files + cleans up only when it is wired)', () => {
    expect(typeof createLongformTickDeps().finisher?.fileFilm).toBe('function');
  });

  test('nothing to remove → no storage call; storage answering { error } is THROWN (the tick counts it)', async () => {
    const quiet = storageSvc();
    await createLongformFinisher(quiet.svc).removeSceneMedia(makeJob({ id: JOB }), { clipPaths: [], seedOrdinals: [], filmPath: null });
    expect(quiet.removed).toEqual([]);
    const refused = storageSvc({ message: 'storage 500' });
    await expect(createLongformFinisher(refused.svc).removeSceneMedia(makeJob({ id: JOB }), { clipPaths: [`longform/${JOB}/s00.mp4`], seedOrdinals: [], filmPath: null })).rejects.toThrow('storage 500');
  });
});

describe('director LLM', () => {
  const opts = { system: 's', maxTokens: 100, temperature: 0.5, json: true as const, purpose: 'bible' as const, attempt: 1 };

  test('a deadline wrapper can only SHORTEN the call, and its abort signal reaches llmText', async () => {
    m(llmText).mockResolvedValue('{}');
    const controller = new AbortController();
    await llmDirectorGenerate('p', { ...opts, timeoutMs: 30_000, signal: controller.signal });
    expect(llmText).toHaveBeenLastCalledWith(expect.objectContaining({ timeoutMs: 30_000, signal: controller.signal }));
    await llmDirectorGenerate('p', { ...opts, timeoutMs: 999_000 });
    expect(llmText).toHaveBeenLastCalledWith(expect.objectContaining({ timeoutMs: 86_000 }));
    await llmDirectorGenerate('p', opts);
    expect(m(llmText).mock.calls.at(-1)![0]).not.toHaveProperty('signal');
  });
});
