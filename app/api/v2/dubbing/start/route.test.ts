/** @jest-environment node */
// Dubbing: who may start one, what source it may read, and how it is filed. The pipeline itself (ffmpeg, STT, TTS) is
// lib/services/dubbing's own suites; here it is a stub. Dubbing does not charge the user's credits yet (an open pricing
// decision), so the only spend gate is the platform provider budget, which runs for real through guardedCall.

jest.mock('server-only', () => ({}));

const mockUser = { id: '11111111-1111-4111-8111-111111111111' };
const OTHER = '22222222-2222-4222-8222-222222222222';
let signedIn = true;
jest.mock('../../../../../lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? mockUser : null } }) } }),
  createServiceRoleClient: () => null,
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: jest.fn(async () => null),
  RATE_LIMITS: { AI: { limit: 10 }, DUBBING_USER: { maxRequests: 10, windowMs: 86_400_000, keyPrefix: 'rl:dub:user' } },
}));
const runDubbing = jest.fn();
jest.mock('../../../../../lib/services/dubbing/dubbingPipeline', () => ({ runDubbing: (...a: unknown[]) => runDubbing(...a) }));
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
const createSignedAssetUrl = jest.fn();
jest.mock('../../../../../lib/orchestrator/storage-adapter', () => ({
  ...jest.requireActual('../../../../../lib/orchestrator/storage-adapter'),
  createSignedAssetUrl: (...a: unknown[]) => createSignedAssetUrl(...a),
}));
import { NextRequest } from 'next/server';
import { POST } from './route';
import { checkRateLimitByKey, RATE_LIMITS } from '../../../../../lib/api/rate-limit';

const SRC = 'https://cdn.example.com/talk.mp4';
const SIGNED = 'https://ours.supabase.co/storage/v1/object/sign/uploads/clip.mp4?token=t';
const DUB = 'https://ours.supabase.co/storage/v1/object/sign/renders/dub.mp4?token=d';
const RESULT = {
  videoUrl: DUB, audioUrl: 'https://ours.supabase.co/a.mp3', subtitlesUrl: 'https://ours.supabase.co/s.srt',
  segments: [{}, {}, {}], detectedLanguage: 'en', speakers: 2, minutes: 2,
  stepsRun: ['extract_audio', 'transcribe', 'translate', 'synthesize', 'mix', 'mux'], droppedLines: 1, untranslatedLines: 0,
};

const post = async (body: Record<string, unknown>) => {
  const res = await POST(new NextRequest('https://myavatar.ge/api/v2/dubbing/start', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { res, json: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  jest.clearAllMocks();
  signedIn = true;
  canProceed.mockResolvedValue({ allowed: true, reason: 'ok' });
  runDubbing.mockResolvedValue({ ok: true, result: RESULT });
  createSignedAssetUrl.mockResolvedValue(SIGNED);
});

describe('POST /api/v2/dubbing/start', () => {
  it('turns a signed-out caller away before anything runs', async () => {
    signedIn = false;
    const { res } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(401);
    expect(createJob).not.toHaveBeenCalled();
    expect(canProceed).not.toHaveBeenCalled();
    expect(runDubbing).not.toHaveBeenCalled();
  });

  it('signs the caller’s own upload, dubs it, and files the dub as a video the Library shows', async () => {
    const { res, json } = await post({ sourceVideoUrl: `${mockUser.id}/clip.mp4`, targetLanguage: 'ka', durationSec: 95 });
    expect(res.status).toBe(200);
    expect(createSignedAssetUrl).toHaveBeenCalledWith('uploads', `${mockUser.id}/clip.mp4`, 3600);
    expect(runDubbing).toHaveBeenCalledWith(
      expect.objectContaining({ sourceVideoUrl: SIGNED, targetLanguage: 'ka', sourceLanguage: 'auto', voiceClone: true, subtitles: true, lipSync: false }),
      { jobId: json.jobId },
    );
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: mockUser.id, serviceType: 'film', params: { subtype: 'dubbing', targetLanguage: 'ka', minutes: 2 },
    }));
    expect(completeJob).toHaveBeenCalledWith(json.jobId, {
      signedUrl: DUB,
      result: { videoUrl: DUB, audioUrl: RESULT.audioUrl, subtitlesUrl: RESULT.subtitlesUrl, subtype: 'dubbing' },
    });
    expect(failJob).not.toHaveBeenCalled();
    expect(json).toEqual(expect.objectContaining({ videoUrl: DUB, segments: 3, targetLanguage: 'ka', detectedLanguage: 'en' }));
    // A dub with a dropped line says so instead of passing as clean.
    expect(json.warnings).toEqual({ droppedLines: 1, untranslatedLines: 0, lipSyncSkipped: false });
  });

  it('asks the platform budget before the provider legs run and books the minutes after', async () => {
    await post({ sourceVideoUrl: SRC, targetLanguage: 'en', sourceLanguage: 'ka', durationSec: 95 });
    expect(canProceed).toHaveBeenCalledWith(expect.objectContaining({ service: 'dubbing', estimatedCost: 0.1 }), {});
    expect(canProceed.mock.invocationCallOrder[0]).toBeLessThan(runDubbing.mock.invocationCallOrder[0]);
    expect(recordUsage).toHaveBeenCalledTimes(1);
  });

  it('does not sign another account’s upload, and refuses the request', async () => {
    const { res } = await post({ sourceVideoUrl: `${OTHER}/clip.mp4`, targetLanguage: 'ka' });
    expect(res.status).toBe(400);
    expect(createSignedAssetUrl).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
    expect(runDubbing).not.toHaveBeenCalled();
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:3000/v.mp4',
    'https://10.0.0.5/v.mp4',
    'https://metadata.google.internal/v.mp4',
    'https://user:pw@cdn.example.com/v.mp4',
    'file:///etc/passwd',
  ])('refuses a source that is not a public http(s) address: %s', async (sourceVideoUrl) => {
    const { res, json } = await post({ sourceVideoUrl, targetLanguage: 'ka' });
    expect(res.status).toBe(400);
    expect(json.error).toBe('invalid_request');
    expect(runDubbing).not.toHaveBeenCalled();
  });

  it('refuses a source longer than five minutes before a job or a budget check', async () => {
    const { res, json } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka', durationSec: 301 });
    expect(res.status).toBe(413);
    expect(json).toEqual(expect.objectContaining({ error: 'source_too_long', maxSourceSec: 300 }));
    expect(createJob).not.toHaveBeenCalled();
    expect(canProceed).not.toHaveBeenCalled();
  });

  it('refuses a dub into the language the video is already in', async () => {
    const { res } = await post({ sourceVideoUrl: SRC, sourceLanguage: 'ka', targetLanguage: 'ka' });
    expect(res.status).toBe(400);
    expect(runDubbing).not.toHaveBeenCalled();
  });

  it('a leg that fails fails the job with its step, and nothing is filed', async () => {
    runDubbing.mockResolvedValue({ ok: false, step: 'transcribe', error: 'stt unavailable' });
    const { res, json } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(502);
    expect(json).toEqual(expect.objectContaining({ error: 'dubbing_failed', step: 'transcribe' }));
    expect(failJob).toHaveBeenCalledWith(json.jobId, 'transcribe: stt unavailable');
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('an exhausted platform budget stops the dub before any provider leg', async () => {
    canProceed.mockResolvedValue({ allowed: false, reason: 'daily_cap' });
    const { res, json } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(429);
    expect(json).toEqual(expect.objectContaining({ error: 'budget_exceeded', reason: 'daily_cap' }));
    expect(runDubbing).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
    expect(failJob).toHaveBeenCalledWith(expect.any(String), 'budget_exceeded');
  });

  it('a pipeline that throws fails the job and answers 500', async () => {
    runDubbing.mockRejectedValue(new Error('ffmpeg missing'));
    const { res, json } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
    expect(res.status).toBe(500);
    expect(failJob).toHaveBeenCalledWith(json.jobId, 'ffmpeg missing');
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('uses the client’s job id for live progress, but never one that already exists or is malformed', async () => {
    const mine = '33333333-3333-4333-8333-333333333333';
    expect((await post({ sourceVideoUrl: SRC, targetLanguage: 'ka', clientJobId: mine })).json.jobId).toBe(mine);

    createJob.mockResolvedValueOnce(false); // the INSERT did not land: someone's row already has this id
    const taken = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka', clientJobId: mine });
    expect(taken.json.jobId).not.toBe(mine);
    expect(runDubbing).toHaveBeenLastCalledWith(expect.anything(), { jobId: taken.json.jobId });
    expect(completeJob).toHaveBeenLastCalledWith(taken.json.jobId, expect.anything());

    await post({ sourceVideoUrl: SRC, targetLanguage: 'ka', clientJobId: 'abc' });
    expect((createJob.mock.calls[2] as unknown as [{ id: string }])[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  // Dubbing bills no credits yet (gap C3), so a per-account daily ceiling is what bounds one person's spend.
  describe('per-account daily ceiling', () => {
    it('counts a valid request against the account, before any job is filed or a provider leg runs', async () => {
      await post({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
      expect(checkRateLimitByKey).toHaveBeenCalledWith(mockUser.id, RATE_LIMITS.DUBBING_USER);
      const cap = (checkRateLimitByKey as jest.Mock).mock.invocationCallOrder[0];
      expect(cap).toBeLessThan(createJob.mock.invocationCallOrder[0]);
      expect(cap).toBeLessThan(runDubbing.mock.invocationCallOrder[0]);
    });

    it('over the ceiling the limiter answers, and nothing is filed or run', async () => {
      (checkRateLimitByKey as jest.Mock).mockResolvedValueOnce(new Response('{"error":"rate_limited"}', { status: 429 }));
      const { res } = await post({ sourceVideoUrl: SRC, targetLanguage: 'ka' });
      expect(res.status).toBe(429);
      expect(createJob).not.toHaveBeenCalled();
      expect(canProceed).not.toHaveBeenCalled();
      expect(runDubbing).not.toHaveBeenCalled();
    });

    it('a request that fails validation spends none of the allowance', async () => {
      const { res } = await post({ sourceVideoUrl: 'http://169.254.169.254/x.mp4', targetLanguage: 'ka' });
      expect(res.status).toBe(400);
      expect(checkRateLimitByKey).not.toHaveBeenCalled();
    });
  });
});
