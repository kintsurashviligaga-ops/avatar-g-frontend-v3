/** @jest-environment node */
// Presentation: who may build a deck, what is checked first, and that the whole deck (not just its count) is filed to
// the Library. The build itself (outline, Imagen, resvg) is lib/services/presentation's own suites; here it is a stub.
// A deck does not charge the user's credits yet (an open pricing decision); the platform provider budget is the gate,
// and it runs for real through guardedCall.

jest.mock('server-only', () => ({}));

const mockUser = { id: '11111111-1111-4111-8111-111111111111' };
let signedIn = true;
jest.mock('../../../../../lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? mockUser : null } }) } }),
  createServiceRoleClient: () => null,
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { STORYBOARD: { limit: 30 } },
}));
const runDeckBuild = jest.fn();
jest.mock('../../../../../lib/services/presentation/deckPipeline', () => ({ runDeckBuild: (...a: unknown[]) => runDeckBuild(...a) }));
const canProceed = jest.fn();
const recordUsage = jest.fn(async () => undefined);
jest.mock('../../../../../lib/services/billing/BillingGuard', () => ({
  canProceed: (...a: unknown[]) => canProceed(...a),
  recordUsage: (...a: unknown[]) => recordUsage(...a),
}));
const createJob = jest.fn(async () => true);
const completeJob = jest.fn(async () => undefined);
const failJob = jest.fn(async () => undefined);
jest.mock('../../../../../lib/orchestrator/jobs', () => ({
  ...jest.requireActual('../../../../../lib/orchestrator/jobs'),
  createJob: (...a: unknown[]) => createJob(...a),
  completeJob: (...a: unknown[]) => completeJob(...a),
  failJob: (...a: unknown[]) => failJob(...a),
}));
import { NextRequest } from 'next/server';
import { POST } from './route';

const png = (i: number) => `https://ours.supabase.co/storage/v1/object/sign/renders/deck/s${i}.png?token=t`;
const COVER = 'https://ours.supabase.co/storage/v1/object/sign/renders/deck/cover.png?token=t';
const slides = (n: number) => Array.from({ length: n }, (_, i) => ({ index: i, title: `Slide ${i}`, bullets: ['a'], pngUrl: png(i), imageUrl: `https://x/${i}.png` }));
const RESULT = {
  deck: { title: 'Tbilisi cafés', language: 'en', theme: 'dark', slides: [] },
  slides: slides(6), coverUrl: COVER, usedFallbackOutline: false, imagesMissing: 0, imagesRequested: true,
  stepsRun: ['outline', 'visuals', 'render'],
};

const post = async (body: Record<string, unknown>) => {
  const res = await POST(new NextRequest('https://myavatar.ge/api/v2/presentation/build', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { res, json: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  jest.clearAllMocks();
  signedIn = true;
  canProceed.mockResolvedValue({ allowed: true, reason: 'ok' });
  runDeckBuild.mockResolvedValue({ ok: true, result: RESULT });
});

describe('POST /api/v2/presentation/build', () => {
  it('turns a signed-out caller away before anything runs', async () => {
    signedIn = false;
    const { res } = await post({ topic: 'Tbilisi cafés' });
    expect(res.status).toBe(401);
    expect(createJob).not.toHaveBeenCalled();
    expect(runDeckBuild).not.toHaveBeenCalled();
  });

  it('builds the deck and files every page, so the Library and a re-opened panel can rebuild it', async () => {
    const { res, json } = await post({ topic: '  Tbilisi   cafés ', slideCount: 6, language: 'en', withImages: true });
    expect(res.status).toBe(200);
    expect(runDeckBuild).toHaveBeenCalledWith(
      { topic: 'Tbilisi cafés', slideCount: 6, language: 'en', theme: 'dark', withImages: true },
      { jobId: json.jobId },
    );
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: mockUser.id, serviceType: 'image', params: { subtype: 'presentation', slides: 6, language: 'en' },
    }));
    expect(completeJob).toHaveBeenCalledWith(json.jobId, {
      signedUrl: COVER,
      result: {
        subtype: 'presentation', slideCount: 6, coverUrl: COVER, url: COVER,
        slides: RESULT.slides.map((s) => ({ index: s.index, pngUrl: s.pngUrl })),
      },
    });
    expect(json).toEqual(expect.objectContaining({ title: 'Tbilisi cafés', coverUrl: COVER, steps: RESULT.stepsRun }));
    expect(json.slides).toHaveLength(6);
    expect(canProceed).toHaveBeenCalledWith(expect.objectContaining({ service: 'presentation' }), {});
    expect(recordUsage).toHaveBeenCalledTimes(1);
  });

  it('a deck with no cover is filed under its first page', async () => {
    runDeckBuild.mockResolvedValue({ ok: true, result: { ...RESULT, coverUrl: null } });
    const { json } = await post({ topic: 'Tbilisi cafés' });
    expect(completeJob).toHaveBeenCalledWith(json.jobId, expect.objectContaining({
      signedUrl: png(0), result: expect.objectContaining({ coverUrl: null, url: png(0) }),
    }));
  });

  it('a degraded deck says so instead of passing as clean', async () => {
    runDeckBuild.mockResolvedValue({ ok: true, result: { ...RESULT, usedFallbackOutline: true, imagesMissing: 2 } });
    const { json } = await post({ topic: 'Tbilisi cafés', withImages: true });
    expect(json.warnings).toEqual({ usedFallbackOutline: true, imagesMissing: 2, imagesRequested: true });
  });

  it.each([
    [{ topic: 'ab' }],
    [{ topic: 'x'.repeat(601) }],
    [{}],
  ])('refuses a missing or out-of-range topic before a job is made: %j', async (body) => {
    const { res, json } = await post(body);
    expect(res.status).toBe(400);
    expect(json.error).toBe('invalid_request');
    expect(createJob).not.toHaveBeenCalled();
    expect(runDeckBuild).not.toHaveBeenCalled();
  });

  it('holds the slide count to 3–12 and defaults the language to Georgian', async () => {
    await post({ topic: 'Tbilisi cafés', slideCount: 50 });
    expect(runDeckBuild).toHaveBeenLastCalledWith(expect.objectContaining({ slideCount: 12, language: 'ka', withImages: false }), expect.anything());
    await post({ topic: 'Tbilisi cafés', slideCount: 1 });
    expect(runDeckBuild).toHaveBeenLastCalledWith(expect.objectContaining({ slideCount: 3 }), expect.anything());
  });

  it('a step that fails fails the job with its step, and nothing is filed', async () => {
    runDeckBuild.mockResolvedValue({ ok: false, step: 'render', error: 'resvg failed' });
    const { res, json } = await post({ topic: 'Tbilisi cafés' });
    expect(res.status).toBe(502);
    expect(json).toEqual(expect.objectContaining({ error: 'deck_failed', step: 'render' }));
    expect(failJob).toHaveBeenCalledWith(json.jobId, 'render: resvg failed');
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('an exhausted platform budget stops the build before it starts', async () => {
    canProceed.mockResolvedValue({ allowed: false, reason: 'monthly_cap' });
    const { res, json } = await post({ topic: 'Tbilisi cafés' });
    expect(res.status).toBe(429);
    expect(json).toEqual(expect.objectContaining({ error: 'budget_exceeded', reason: 'monthly_cap' }));
    expect(runDeckBuild).not.toHaveBeenCalled();
    expect(failJob).toHaveBeenCalledWith(expect.any(String), 'budget_exceeded');
  });

  it('a build that throws fails the job and answers 500', async () => {
    runDeckBuild.mockRejectedValue(new Error('out of memory'));
    const { res, json } = await post({ topic: 'Tbilisi cafés' });
    expect(res.status).toBe(500);
    expect(failJob).toHaveBeenCalledWith(json.jobId, 'out of memory');
  });

  it('never reuses a client job id that already belongs to a row', async () => {
    const mine = '33333333-3333-4333-8333-333333333333';
    createJob.mockResolvedValueOnce(false);
    const { json } = await post({ topic: 'Tbilisi cafés', clientJobId: mine });
    expect(json.jobId).not.toBe(mine);
    expect(completeJob).toHaveBeenCalledWith(json.jobId, expect.anything());
  });
});
