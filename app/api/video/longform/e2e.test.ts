/** @jest-environment node */
/**
 * End to end, with no network: POST /api/video/longform (scripted Director, in-memory database) → the rows it wrote
 * → jobFromRow / sceneFromRow → the REAL tick driven by the tick.test fakes (testing/tickFakes: claim semantics,
 * scripted Veo, fake ledger, stitcher, finisher) → every patch the tick made mapped back to columns
 * (jobPatchToColumns / scenePatchToColumns) → GET /api/video/longform/[id] and POST …/cancel on those rows.
 *
 *   1. a 104 s film runs to `done`: two act debits, 13 submits, the film filed in the Library, the scene clips + the
 *      act-2 seed frame removed, nothing refunded, the status route serving the freshly signed film;
 *   2. a forced failure (two ambiguous submits in a 13-scene film → over the 10 % budget) fails the job and refunds
 *      exactly the charged, undelivered scenes, each under a ref that starts with its act's debit ref;
 *   3. a cancel through the route mid-render: the tick cancels, refunds what was not delivered, keeps what was.
 */
jest.mock('server-only', () => ({}));
const mockAuth = jest.fn();
const mockSvc = jest.fn();
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: (...a: unknown[]) => mockAuth(...a),
  createServiceRoleClient: (...a: unknown[]) => mockSvc(...a),
}));
const mockGenerate = jest.fn();
jest.mock('../../../../lib/video/longform/directorLlm', () => ({ llmDirectorGenerate: (...a: unknown[]) => mockGenerate(...a) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: async () => null, checkRateLimit: async () => null, RATE_LIMITS: { READ: {}, WRITE: {} } }));
jest.mock('../../../../lib/services/billing/BillingGuard', () => ({ getDailyUsage: async () => ({ used: 0, limit: 100, percent: 0 }) }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
const mockSign = jest.fn();
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  createSignedAssetUrl: (...a: unknown[]) => mockSign(...a),
  createSignedAssetUrls: async (_b: string, paths: string[]) => paths.map((p) => `https://signed/${p}`),
}));

import { NextRequest } from 'next/server';
import { POST as create } from './route';
import { GET as status } from './[id]/route';
import { POST as cancel } from './[id]/cancel/route';
import { jobFromRow, jobPatchToColumns, sceneFromRow, scenePatchToColumns } from '@/lib/video/longform/rows';
import { actChargeRef, runLongformTick } from '@/lib/video/longform/tick';
import { FakeDb } from '@/lib/video/longform/testing/fakeDb';
import { fakeGenerator, filmReplies } from '@/lib/video/longform/testing/directorFakes';
import { harness, MIN, runUntilTerminal, TICK_OPTS, type Harness, type HarnessOptions } from '@/lib/video/longform/testing/tickFakes';

const env = process.env as Record<string, string | undefined>;
const KEYS = ['LONGFORM_VIDEO_ENABLED', 'LONGFORM_MARGIN', 'DAILY_COST_LIMIT'];
const saved: Record<string, string | undefined> = {};
let db: FakeDb;

beforeEach(() => {
  for (const k of KEYS) saved[k] = env[k];
  env.LONGFORM_VIDEO_ENABLED = '1';
  env.LONGFORM_MARGIN = '1.5';
  env.DAILY_COST_LIMIT = '100';
  db = new FakeDb({ profiles: [{ id: 'u1', tier: 'BUSINESS', credits_balance: 5000 }] });
  mockAuth.mockReset().mockResolvedValue({ supabase: {}, user: { id: 'u1' } });
  mockSvc.mockReset().mockImplementation(() => db);
  mockGenerate.mockReset().mockImplementation(fakeGenerator(filmReplies(104)).generate);
  mockSign.mockReset().mockImplementation(async (_b: string, p: string) => `https://signed/${p}`);
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

/** Order a 104 s film through the route; returns its id. */
async function order(): Promise<string> {
  const res = await create(new NextRequest('https://myavatar.ge/api/video/longform', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'A road trip to a wedding across Georgia', seconds: 104, tier: 'fast' }),
    headers: { 'content-type': 'application/json' },
  }));
  expect(res.status).toBe(201);
  return (await res.json()).id as string;
}

/** The rows the route wrote, as the tick would lease them (claim_longform_jobs returns j.*; scenes are select *). */
function queueFromDb(id: string, o: HarnessOptions = {}): Harness {
  const h = harness({ ...o, start: Date.now() });
  const job = jobFromRow(db.rows('longform_jobs').find((r) => r.id === id)!);
  const scenes = db.rows('longform_scenes').filter((r) => r.job_id === id).map(sceneFromRow);
  h.store.add(job, scenes);
  return h;
}

/** Everything the tick persisted, written back to the rows through the real patch → column mapping. */
function flushToDb(h: Harness, id: string): void {
  const job = db.rows('longform_jobs').find((r) => r.id === id)!;
  for (const p of h.store.jobPatches.splice(0)) Object.assign(job, jobPatchToColumns(p));
  const scenes = db.rows('longform_scenes').filter((r) => r.job_id === id);
  for (const { ordinal, patch } of h.store.scenePatches.splice(0)) Object.assign(scenes.find((s) => s.ordinal === ordinal)!, scenePatchToColumns(patch));
}

const statusOf = async (id: string) => (await status(new NextRequest(`https://myavatar.ge/api/video/longform/${id}`), { params: { id } })).json();
const refundedOrdinals = (h: Harness) => h.refunds.map((r) => Number(/:s(\d+):refund$/.exec(r.ref)![1])).sort((a, b) => a - b);

test('1. ordered → queued → rendered act by act → stitched → done, filed, scene media removed, served signed', async () => {
  const id = await order();
  const h = queueFromDb(id);
  expect(h.store.job(id)).toMatchObject({ status: 'planned', userId: 'u1', creditsPerScene: 39, sceneCount: 13 });

  const reports = await runUntilTerminal(h, { jobId: id });
  const job = h.store.job(id);
  expect(job).toMatchObject({ status: 'done', outputUrl: 'https://cdn/film.mp4', errorCode: null, refundsPending: false });
  // Debited one act at a time, under the act refs, for exactly that act's scenes.
  expect(h.debits).toEqual([{ ref: actChargeRef(id, 0), credits: 7 * 39 }, { ref: actChargeRef(id, 1), credits: 6 * 39 }]);
  expect(h.submits.map((s) => s.ordinal).sort((a, b) => a - b)).toEqual([...Array(13).keys()]);
  // Act 2's opener rendered from act 1's last frame — the depends_on the route wrote.
  expect(h.submits.find((s) => s.ordinal === 7)!.input.request.startImage).toEqual({ kind: 'url', url: 'https://cdn/6-last.jpg' });
  expect(h.refunds).toEqual([]);
  expect(h.filed).toEqual([{ jobId: id, userId: 'u1', film: { url: 'https://cdn/film.mp4', path: `longform/${id}/film.mp4`, bytes: 40_000_000 } }]);
  expect(h.removed).toHaveLength(1);
  expect(h.removed[0]!.clipPaths).toHaveLength(13);
  expect(h.removed[0]!.clipPaths.every((p) => p.startsWith(`longform/${id}/`))).toBe(true);
  expect(h.removed[0]!.seedOrdinals).toEqual([7]);
  expect(reports.every((r) => r.errors === 0)).toBe(true);

  flushToDb(h, id);
  const view = await statusOf(id);
  expect(view).toMatchObject({ id, status: 'done', terminal: true, film: { url: `https://signed/longform/${id}/film.mp4`, bytes: 40_000_000 }, progress: { total: 13, delivered: 13, failed: 0 } });
  expect(view.scenes.every((s: { url: unknown }) => s.url === null)).toBe(true); // the clips are gone; only the film is served
});

test('2. a forced failure: two ambiguous submits → the job fails, and exactly the charged, undelivered scenes are refunded', async () => {
  const id = await order();
  const h = queueFromDb(id, { submit: (o) => (o === 1 || o === 2 ? new Error('socket hang up') : (undefined as never)) });
  await runUntilTerminal(h, { jobId: id });

  const job = h.store.job(id);
  expect(job).toMatchObject({ status: 'failed', errorCode: 'too_many_scene_failures', refundsPending: false });
  // The two ambiguous submits were never re-submitted (a job may exist and bill).
  expect(h.submits.filter((s) => s.ordinal === 1 || s.ordinal === 2)).toHaveLength(2);

  const scenes = h.store.scenes.get(id)!;
  const charged = scenes.filter((s) => s.chargeRef !== null);
  const delivered = scenes.filter((s) => s.status === 'delivered').map((s) => s.ordinal);
  expect(charged.length).toBeGreaterThan(0);
  expect(refundedOrdinals(h)).toEqual(charged.filter((s) => !delivered.includes(s.ordinal)).map((s) => s.ordinal));
  expect(refundedOrdinals(h)).toEqual(expect.arrayContaining([1, 2]));
  for (const r of h.refunds) {
    expect(r.credits).toBe(39);
    expect(r.ref.startsWith(`${r.chargeRef}:`)).toBe(true); // capped by that act's debit in the ledger
    expect([actChargeRef(id, 0), actChargeRef(id, 1)]).toContain(r.chargeRef);
  }
  // Never more back than was taken.
  const debited = h.debits.reduce((s, d) => s + d.credits, 0);
  expect(h.refunds.reduce((s, r) => s + r.credits, 0)).toBeLessThanOrEqual(debited);
  // A failed film is not filed, and its delivered clips are kept (they are the user's).
  expect(h.filed).toEqual([]);
  expect(h.removed).toEqual([]);

  flushToDb(h, id);
  const view = await statusOf(id);
  expect(view).toMatchObject({ status: 'failed', terminal: true, errorCode: 'too_many_scene_failures', film: null });
  expect(view.scenes.filter((s: { url: unknown }) => s.url !== null).map((s: { ordinal: number }) => s.ordinal)).toEqual(delivered);
});

test('3. canceled through the route mid-render: the tick cancels, refunds the undelivered, keeps the delivered', async () => {
  const id = await order();
  const h = queueFromDb(id);
  for (let i = 0; i < 3; i++) {
    h.clock.t += MIN;
    await runLongformTick(h.deps, TICK_OPTS);
  }
  flushToDb(h, id);
  const res = await cancel(new NextRequest(`https://myavatar.ge/api/video/longform/${id}/cancel`, { method: 'POST' }), { params: { id } });
  expect(res.status).toBe(202);
  // The route wrote only the flag; the queue reads it on its next lease.
  h.store.job(id).cancelRequested = db.rows('longform_jobs').find((r) => r.id === id)!.cancel_requested === true;
  expect(h.store.job(id).cancelRequested).toBe(true);

  await runUntilTerminal(h, { jobId: id });
  expect(h.store.job(id)).toMatchObject({ status: 'canceled', errorCode: 'canceled_by_user' });
  const scenes = h.store.scenes.get(id)!;
  const delivered = scenes.filter((s) => s.status === 'delivered').map((s) => s.ordinal);
  expect(delivered.length).toBeGreaterThan(0);
  expect(refundedOrdinals(h)).toEqual(scenes.filter((s) => s.chargeRef !== null && !delivered.includes(s.ordinal)).map((s) => s.ordinal));
  expect(h.filed).toEqual([]);
  expect(h.removed).toEqual([]);

  flushToDb(h, id);
  expect(await statusOf(id)).toMatchObject({ status: 'canceled', terminal: true, cancelRequested: true });
  // Canceling again: already finished.
  expect((await cancel(new NextRequest(`https://myavatar.ge/api/video/longform/${id}/cancel`, { method: 'POST' }), { params: { id } })).status).toBe(409);
});
