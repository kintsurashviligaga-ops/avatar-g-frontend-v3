/** @jest-environment node */
/**
 * POST /api/video/longform with an in-memory database (testing/fakeDb), a scripted Director (testing/directorFakes)
 * and no network. Rules under test: 404 while LONGFORM_VIDEO_ENABLED is off — before auth, before anything; 401
 * without a session (FILM_ALLOW_ANONYMOUS does not reopen it); 503 while LONGFORM_MARGIN is unset; the per-account
 * rate and in-flight caps; every validation reason returned (400; 402 when only the balance is short); a Director
 * failure or timeout writes nothing and charges nothing; on success ONE job and N scenes — written directing → scenes
 * → planned — that round-trip through jobFromRow / sceneFromRow with the right depends_on; a failed later write
 * takes the job back out; and the 300 s budget is the same in the route, vercel.json and the Director's deadline.
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
const mockRunDirector = jest.fn();
jest.mock('../../../../lib/video/longform/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/video/longform/api')>('../../../../lib/video/longform/api');
  return { ...actual, runDirectorWithDeadline: (...a: unknown[]) => mockRunDirector(...a) };
});
const mockRateLimit = jest.fn();
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: (...a: unknown[]) => mockRateLimit(...a) }));
const mockDailyUsage = jest.fn();
jest.mock('../../../../lib/services/billing/BillingGuard', () => ({ getDailyUsage: (...a: unknown[]) => mockDailyUsage(...a) }));
const mockReportError = jest.fn();
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: (...a: unknown[]) => mockReportError(...a) }));
// Never reached by this route — mocked so a regression that starts charging at create time fails loudly here.
const mockDeduct = jest.fn();
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: (...a: unknown[]) => mockDeduct(...a), refundCredits: jest.fn(), netDebitedForRef: jest.fn() }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { maxDuration, POST } from './route';
import { DIRECTOR_DEADLINE_MS } from '@/lib/video/longform/api';
import { jobFromRow, sceneFromRow } from '@/lib/video/longform/rows';
import { FakeDb } from '@/lib/video/longform/testing/fakeDb';
import { ANA, fakeGenerator, filmReplies, GIO } from '@/lib/video/longform/testing/directorFakes';

const realRunDirector = jest.requireActual<typeof import('@/lib/video/longform/api')>('../../../../lib/video/longform/api').runDirectorWithDeadline;

const env = process.env as Record<string, string | undefined>;
const KEYS = ['LONGFORM_VIDEO_ENABLED', 'LONGFORM_MARGIN', 'DAILY_COST_LIMIT', 'FILM_ALLOW_ANONYMOUS', 'LONGFORM_MAX_ACTIVE_JOBS', 'LONGFORM_MAX_JOB_COST_USD'];
const saved: Record<string, string | undefined> = {};

const req = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/video/longform', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const BODY = { prompt: 'A road trip to a wedding across Georgia', seconds: 104, tier: 'fast' };

let db: FakeDb;
const writes = () => db.ops.filter((o) => o.op !== 'select');

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = env[k];
    delete env[k];
  }
  env.LONGFORM_VIDEO_ENABLED = '1';
  env.LONGFORM_MARGIN = '1.5';
  env.DAILY_COST_LIMIT = '100';
  db = new FakeDb({ profiles: [{ id: 'u1', tier: 'BUSINESS', credits_balance: 5000 }] });
  mockAuth.mockReset().mockResolvedValue({ supabase: {}, user: { id: 'u1' } });
  mockSvc.mockReset().mockImplementation(() => db);
  mockGenerate.mockReset().mockImplementation(fakeGenerator(filmReplies(104)).generate);
  mockRunDirector.mockReset().mockImplementation((...a: Parameters<typeof realRunDirector>) => realRunDirector(...a));
  mockRateLimit.mockReset().mockResolvedValue(null);
  mockDailyUsage.mockReset().mockResolvedValue({ used: 20, limit: 100, percent: 20 });
  mockReportError.mockReset();
  mockDeduct.mockReset();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

describe('dark by default', () => {
  test('404 while LONGFORM_VIDEO_ENABLED is off — before auth, and nothing is read, written or generated', async () => {
    for (const v of [undefined, '', '0', 'false', 'off']) {
      if (v === undefined) delete env.LONGFORM_VIDEO_ENABLED;
      else env.LONGFORM_VIDEO_ENABLED = v;
      const res = await POST(req(BODY));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
    }
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockSvc).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(db.ops).toEqual([]);
  });
});

describe('who may order', () => {
  test('401 without a session (no user, or the auth read throwing)', async () => {
    mockAuth.mockResolvedValueOnce({ supabase: {}, user: null });
    const a = await POST(req(BODY));
    expect(a.status).toBe(401);
    expect(await a.json()).toMatchObject({ error: 'auth_required', authRequired: true });
    mockAuth.mockRejectedValueOnce(new Error('no supabase env'));
    expect((await POST(req(BODY))).status).toBe(401);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(db.ops).toEqual([]);
  });

  test('FILM_ALLOW_ANONYMOUS does not reopen long-form', async () => {
    env.FILM_ALLOW_ANONYMOUS = '1';
    mockAuth.mockResolvedValueOnce({ supabase: {}, user: null });
    expect((await POST(req(BODY))).status).toBe(401);
    mockAuth.mockResolvedValueOnce({ supabase: {}, user: { id: 'anonymous' } });
    expect((await POST(req(BODY))).status).toBe(401);
  });

  test('503 while LONGFORM_MARGIN is unset or not a price — the margin is the owner\'s', async () => {
    for (const v of [undefined, '', '0.5', 'abc']) {
      if (v === undefined) delete env.LONGFORM_MARGIN;
      else env.LONGFORM_MARGIN = v;
      const res = await POST(req(BODY));
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: 'pricing_unconfigured' });
    }
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(db.ops).toEqual([]);
  });

  test('the per-account rate limit answers for itself, keyed on the verified user', async () => {
    mockRateLimit.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
    expect((await POST(req(BODY))).status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledWith('u1', expect.objectContaining({ keyPrefix: 'rl:longform:create' }));
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('429 with too many films in flight; 503 when the balance or the count cannot be read', async () => {
    db.rows('longform_jobs').push({ id: 'a', user_id: 'u1', status: 'rendering' }, { id: 'b', user_id: 'u1', status: 'planned' }, { id: 'c', user_id: 'u1', status: 'done' });
    const busy = await POST(req(BODY));
    expect(busy.status).toBe(429);
    expect(await busy.json()).toMatchObject({ error: 'too_many_active_jobs' });

    db = new FakeDb({ profiles: [{ id: 'u1', tier: 'BUSINESS', credits_balance: 5000 }] });
    db.failNext('longform_jobs', 'select');
    const blind = await POST(req(BODY));
    expect(blind.status).toBe(503);
    expect(await blind.json()).toEqual({ error: 'billing_unavailable' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe('validation — every reason, before any Director call', () => {
  test('a malformed body: 400 with each shape reason', async () => {
    const res = await POST(req({ prompt: '', seconds: 'soon', tier: 'ultra' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_request');
    expect(body.reasons.map((r: { code: string }) => r.code).sort()).toEqual(['invalid_duration', 'invalid_prompt', 'invalid_tier']);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(db.ops).toEqual([]);
  });

  test('the grid and the plan: off-grid length, a tier the plan lacks, over the daily envelope — all at once', async () => {
    db = new FakeDb({ profiles: [{ id: 'u1', tier: 'FREE', credits_balance: 5000 }] });
    env.DAILY_COST_LIMIT = '10';
    const res = await POST(req({ ...BODY, seconds: 250, tier: 'standard' }));
    expect(res.status).toBe(400);
    const codes = (await res.json()).reasons.map((r: { code: string }) => r.code).sort();
    expect(codes).toEqual(['above_maximum', 'above_tier_limit', 'off_grid', 'tier_not_allowed']);
    const res2 = await POST(req({ ...BODY, seconds: 8, tier: 'fast', resolution: '4k' }));
    expect((await res2.json()).reasons.map((r: { code: string }) => r.code)).toEqual(['resolution_not_allowed']);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  test('only the balance short: 402 insufficient_credits, with the reason and the price', async () => {
    db = new FakeDb({ profiles: [{ id: 'u1', tier: 'BUSINESS', credits_balance: 100 }] });
    const res = await POST(req(BODY));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: 'insufficient_credits', reasons: [{ code: 'insufficient_credits', message: expect.stringContaining('507 credits') }] });
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe('the Director', () => {
  test('a Director failure inserts nothing and charges nothing (502, with the reason)', async () => {
    mockGenerate.mockImplementation(fakeGenerator(['not json', 'still not json']).generate);
    const res = await POST(req(BODY));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'director_failed', reason: 'bible_unparseable' });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(writes()).toEqual([]);
    expect(db.rows('longform_jobs')).toEqual([]);
    expect(db.rows('longform_scenes')).toEqual([]);
    expect(mockDeduct).not.toHaveBeenCalled();
  });

  test('a failed act says which act', async () => {
    mockGenerate.mockImplementation(fakeGenerator([filmReplies(104)[0], 'x', 'y']).generate);
    const res = await POST(req(BODY));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'director_failed', reason: 'act_unparseable', act: 0 });
    expect(writes()).toEqual([]);
  });

  test('a missed deadline is a 504 — nothing written, nothing charged', async () => {
    mockRunDirector.mockResolvedValueOnce({ ok: false, error: 'director_timeout', detail: 'late', calls: 2 });
    const res = await POST(req(BODY));
    expect(res.status).toBe(504);
    expect(await res.json()).toMatchObject({ error: 'director_timeout' });
    expect(writes()).toEqual([]);
    expect(mockDeduct).not.toHaveBeenCalled();
  });

  test('it runs under the 240 s deadline, with the brief and the language', async () => {
    await POST(req({ ...BODY, language: 'ka', dialogue: 'გამარჯობა.' }));
    expect(mockRunDirector).toHaveBeenCalledWith(
      expect.objectContaining({ brief: BODY.prompt, seconds: 104, language: 'ka', dialogue: 'გამარჯობა.', hasReferenceImage: false }),
      expect.any(Function),
      { deadlineMs: DIRECTOR_DEADLINE_MS },
    );
  });
});

describe('success: one job, N scenes', () => {
  test('201; the job is written directing → its 13 scenes → promoted planned; rows round-trip with the right depends_on', async () => {
    const res = await POST(req({ ...BODY, format: '9:16', seed: 77, negativePrompt: 'crowds', userId: 'someone-else' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      status: 'planned', seconds: 104, sceneCount: 13, acts: 2, tier: 'fast', resolution: '1080p', format: '9:16', title: 'The Long Way Home',
      credits: { perScene: 39, total: 507 }, warnings: [],
    });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);

    // Exactly the three writes, in this order.
    expect(writes().map((o) => `${o.op} ${o.table}`)).toEqual(['insert longform_jobs', 'insert longform_scenes', 'update longform_jobs']);
    expect((writes()[0]!.payload as { status: string }).status).toBe('directing');
    expect(writes()[2]!.filters).toEqual([['eq', 'id', body.id], ['eq', 'status', 'directing']]);

    const jobs = db.rows('longform_jobs').filter((r) => r.id === body.id);
    expect(jobs).toHaveLength(1);
    const job = jobFromRow(jobs[0]!);
    expect(job).toMatchObject({
      id: body.id, userId: 'u1', status: 'planned', sceneCount: 13, tier: 'fast', format: '9:16', resolution: '1080p', seed: 77,
      creditsPerScene: 39, cancelRequested: false, refundsPending: false, options: { negativePrompt: 'crowds' }, prompt: BODY.prompt,
    });
    expect(job.bible.characters.map((c) => c.id)).toEqual(['ana', 'gio']);
    expect(job.deadlineAt - Date.now()).toBeGreaterThan(23 * 3_600_000); // the full render deadline, set on promotion

    const scenes = db.rows('longform_scenes').map(sceneFromRow).sort((a, b) => a.ordinal - b.ordinal);
    expect(scenes).toHaveLength(13);
    expect(db.rows('longform_scenes').every((r) => r.job_id === body.id && r.user_id === 'u1')).toBe(true);
    expect(scenes.map((s) => s.act)).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
    expect(scenes.map((s) => s.dependsOn)).toEqual([null, null, null, null, null, null, null, 6, null, null, null, null, null]);
    for (const s of scenes) {
      expect(s).toMatchObject({ status: 'queued', attempts: 0, chargeRef: null, chargeCredits: 0, refunded: false });
      expect([ANA, GIO].some((d) => s.spec.shot.subject.includes(d))).toBe(true); // the bible's locked cast, verbatim
    }
    expect(scenes[0]!.spec.shot.subject).toContain(ANA);
    expect(mockDeduct).not.toHaveBeenCalled(); // acts are debited by the tick, one at a time
  });

  test('no seed given → one is picked for the whole film; reference images switch act chaining off', async () => {
    const res = await POST(req({ ...BODY, referenceImageUrls: ['https://abc.supabase.co/storage/v1/object/sign/uploads/me.jpg?token=t'] }));
    expect(res.status).toBe(201);
    const job = jobFromRow(db.rows('longform_jobs')[0]!);
    expect(typeof job.seed).toBe('number');
    expect(job.options.referenceImageUrls).toEqual(['https://abc.supabase.co/storage/v1/object/sign/uploads/me.jpg?token=t']);
    expect(db.rows('longform_scenes').every((r) => r.depends_on === null)).toBe(true);
    expect(mockRunDirector).toHaveBeenCalledWith(expect.objectContaining({ hasReferenceImage: true }), expect.any(Function), expect.anything());
  });

  test('a budget-pacing warning rides along without blocking', async () => {
    mockDailyUsage.mockResolvedValueOnce({ used: 95, limit: 100, percent: 95 });
    const res = await POST(req(BODY));
    expect(res.status).toBe(201);
    expect((await res.json()).warnings).toEqual([expect.objectContaining({ code: 'platform_budget_pacing' })]);
  });
});

describe('a later write failing takes the job back out', () => {
  test('job insert fails → 503, no scenes written', async () => {
    db.failNext('longform_jobs', 'insert', 'check constraint');
    const res = await POST(req(BODY));
    expect(res.status).toBe(503);
    expect(writes().map((o) => `${o.op} ${o.table}`)).toEqual(['insert longform_jobs']);
    expect(db.rows('longform_jobs')).toEqual([]);
  });

  test('scene insert fails → the directing job is deleted (scenes cascade), 503, reported', async () => {
    db.failNext('longform_scenes', 'insert', 'octet_length');
    const res = await POST(req(BODY));
    expect(res.status).toBe(503);
    expect(writes().map((o) => `${o.op} ${o.table}`)).toEqual(['insert longform_jobs', 'insert longform_scenes', 'delete longform_jobs']);
    expect(db.rows('longform_jobs')).toEqual([]);
    expect(db.rows('longform_scenes')).toEqual([]);
    expect(mockReportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ stage: 'insert_scenes' }));
  });

  test('promotion fails → job and scenes deleted; a delete that fails too leaves only a directing row the tick will fail', async () => {
    db.failNext('longform_jobs', 'update', 'timeout');
    expect((await POST(req(BODY))).status).toBe(503);
    expect(db.rows('longform_jobs')).toEqual([]);
    expect(db.rows('longform_scenes')).toEqual([]);

    db = new FakeDb({ profiles: [{ id: 'u1', tier: 'BUSINESS', credits_balance: 5000 }] });
    mockGenerate.mockImplementation(fakeGenerator(filmReplies(104)).generate);
    db.failNext('longform_jobs', 'update', 'timeout');
    db.failNext('longform_jobs', 'delete', 'timeout');
    expect((await POST(req(BODY))).status).toBe(503);
    expect(db.rows('longform_jobs').map((r) => r.status)).toEqual(['directing']);
    expect(mockReportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ route: '/api/video/longform' }));
  });
});

describe('the 300 s budget', () => {
  test('route maxDuration 300, vercel.json (which overrides it) ≥ 300, and the Director deadline leaves 60 s for the rest', () => {
    expect(maxDuration).toBe(300);
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { functions: Record<string, { maxDuration?: number }> };
    expect(vercel.functions['app/api/video/longform/route.ts']?.maxDuration).toBe(300);
    // The specific entry must come before the app/api/video/** glob (60 s), as every other override in the file does.
    const keys = Object.keys(vercel.functions);
    expect(keys.indexOf('app/api/video/longform/route.ts')).toBeLessThan(keys.indexOf('app/api/video/**'));
    expect(DIRECTOR_DEADLINE_MS + 60_000).toBeLessThanOrEqual(maxDuration * 1000);
    // No cron entry yet — scheduling the tick is an activation step.
    expect(JSON.stringify((vercel as { crons?: unknown }).crons ?? [])).not.toContain('longform');
  });
});
