/** @jest-environment node */
/**
 * POST /api/video/director-workflow/scene — one scene = one charged clip, through the single-clip charge path. Pins:
 * 404 while the flag is off; a board with problems, a wrong price, a missing previous clip or an unreadable frame are all
 * refused BEFORE any debit; a Georgian scene goes to Omni with the lines verbatim and the previous clip's last frame as
 * its first frame; a refused submit is refunded. No network: every engine, ledger and ffmpeg call is mocked.
 */
jest.mock('server-only', () => ({}));
let mockUser: { id: string } | null = null;
jest.mock('../../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../../lib/admin/guard', () => ({ isAdminUser: jest.fn(() => false) }));
jest.mock('../../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null), RATE_LIMITS: {} }));
jest.mock('../../../../../lib/platform/redis', () => ({ getRedisClient: () => null }));
jest.mock('../../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../../lib/genjutsu/veoScene', () => ({ submitScene: jest.fn() }));
jest.mock('../../../../../lib/genjutsu/serverCommon', () => ({
  ...jest.requireActual('../../../../../lib/genjutsu/serverCommon'),
  claimDailySlot: jest.fn(async () => true),
  releaseDailySlot: jest.fn(async () => undefined),
}));
jest.mock('../../../../../lib/orchestrator/idempotency', () => ({
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
}));
jest.mock('../../../../../lib/orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../../lib/orchestrator/jobs', () => ({ createJob: jest.fn(async () => true), failJob: jest.fn(async () => undefined) }));
jest.mock('../../../../../lib/server/serviceSwitches', () => ({ serviceOffResponse: jest.fn(async () => null) }));
jest.mock('../../../../../lib/video/omniClip', () => ({ submitOmniClip: jest.fn(), OMNI_MODEL: 'gemini-omni-1.2-flash' }));
jest.mock('../../../../../lib/veo/engine', () => ({ veoModelProblem: jest.fn(() => null) }));
jest.mock('../../../../../lib/video/lastFrame', () => ({ extractLastFrame: jest.fn() }));
jest.mock('../../../../../lib/ai/llmText', () => ({ llmText: jest.fn(async () => null) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { submitScene } from '../../../../../lib/genjutsu/veoScene';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '../../../../../lib/orchestrator/ledger';
import { createJob, failJob } from '../../../../../lib/orchestrator/jobs';
import { submitOmniClip } from '../../../../../lib/video/omniClip';
import { extractLastFrame } from '../../../../../lib/video/lastFrame';
import { emptyScene, quoteProject, type DwProject } from '../../../../../lib/video/directorsWorkflow';

const ENV = { ...process.env };
const UID = '11111111-2222-4333-8444-555555555555';
const OMNI_ID = 'v1_ChdpbnRlcmFjdGlvbi0xMjM0NTY3ODkwEhdpbnRlcmFjdGlvbi0xMjM0NTY3ODkw';
const post = (body: unknown) => new NextRequest('https://myavatar.ge/api/video/director-workflow/scene', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const board = (): DwProject => ({
  id: 'dw_1', title: 'Café', logline: 'Two friends meet', aspect: '9:16', resolution: '720p',
  characters: [{ id: 'nino', name: 'Nino', look: 'woman, 30, red coat', voice: 'female' }],
  scenes: [
    { ...emptyScene('s1'), order: 1, title: 'One', action: 'Nino walks into a cafe.', firstFrame: 'none' },
    { ...emptyScene('s2'), order: 2, title: 'Two', action: 'Nino sits at the window and waves.', firstFrame: 'previous', characterIds: ['nino'],
      audio: { lines: [{ characterId: 'nino', text: 'გამარჯობა, გიგა!' }], ambience: 'quiet cafe chatter', effects: [], music: null } },
  ],
  status: 'approved', version: 3,
});
const priceOf = (p: DwProject, id: string) => quoteProject(p).scenes.find((s) => s.sceneId === id)!.credits;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, GENJUTSU_CHARGE_SECRET: 'test-genjutsu-secret', DIRECTORS_WORKFLOW: 'everyone' };
  mockUser = { id: UID };
  (submitOmniClip as jest.Mock).mockResolvedValue({ ok: true, id: OMNI_ID, model: 'gemini-omni-1.2-flash' });
  (submitScene as jest.Mock).mockResolvedValue({ ok: true, operation: 'projects/p/locations/us-central1/publishers/google/models/veo/operations/abc', aspect: '9:16' });
  (extractLastFrame as jest.Mock).mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0x00]));
});
afterAll(() => { process.env = ENV; });

it('404 while the flag is off, before anything else', async () => {
  process.env.DIRECTORS_WORKFLOW = '';
  const p = board();
  expect((await POST(post({ project: p, sceneId: 's1', expectedCredits: priceOf(p, 's1') }))).status).toBe(404);
  expect(hasSufficientBalance).not.toHaveBeenCalled();
});

it('refuses a board with problems, an unknown scene and a changed price — nothing is debited', async () => {
  const p = board();
  const broken = { ...p, scenes: p.scenes.map((s) => (s.id === 's2' ? { ...s, characterIds: [] } : s)) };
  expect((await POST(post({ project: broken, sceneId: 's2', expectedCredits: 1 }))).status).toBe(422);
  expect((await POST(post({ project: p, sceneId: 'zz', expectedCredits: 1 }))).status).toBe(404);
  const res = await POST(post({ project: p, sceneId: 's1', expectedCredits: priceOf(p, 's1') + 1 }));
  expect(res.status).toBe(409);
  expect((await res.json()).credits).toBe(priceOf(p, 's1'));
  expect(deductCredits).not.toHaveBeenCalled();
});

it('a scene that continues needs the previous clip, and a frame that cannot be read is refused free', async () => {
  const p = board();
  const price = priceOf(p, 's2');
  expect((await POST(post({ project: p, sceneId: 's2', expectedCredits: price }))).status).toBe(422);
  (extractLastFrame as jest.Mock).mockResolvedValueOnce(null);
  const res = await POST(post({ project: p, sceneId: 's2', expectedCredits: price, previousClipUrl: 'https://cdn.example/clip1.mp4' }));
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe('previous_frame_unavailable');
  expect(deductCredits).not.toHaveBeenCalled();
});

it('a Georgian scene: Omni at the film resolution, lines verbatim, last frame first, one debit of the card price', async () => {
  const p = board();
  const price = priceOf(p, 's2');
  const res = await POST(post({ project: p, sceneId: 's2', expectedCredits: price, previousClipUrl: 'https://cdn.example/clip1.mp4' }));
  expect(res.status).toBe(202);
  const j = await res.json();
  expect(j).toMatchObject({ success: true, sceneId: 's2', credits: price, engine: 'Gemini Omni Flash', resolution: '720p' });
  expect(typeof j.jobId).toBe('string');
  expect(extractLastFrame).toHaveBeenCalledWith('https://cdn.example/clip1.mp4');
  const call = (submitOmniClip as jest.Mock).mock.calls[0][0];
  expect(call.firstFrame).toMatchObject({ mimeType: 'image/jpeg' });
  expect(call.prompt).toContain('გამარჯობა, გიგა!');
  expect(call.prompt).toContain('Sound design: the spoken lines, quiet cafe chatter. No music.');
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect((deductCredits as jest.Mock).mock.calls[0][1]).toBe(price);
  expect((createJob as jest.Mock).mock.calls[0][0].params).toMatchObject({ op: 'dw-scene', project: 'dw_1', version: 3, sceneId: 's2', _reserve: { credits: price } });
});

it('a silent 8 s scene goes to Veo with no first frame', async () => {
  const p = board();
  const res = await POST(post({ project: p, sceneId: 's1', expectedCredits: priceOf(p, 's1') }));
  expect(res.status).toBe(202);
  expect(submitScene).toHaveBeenCalledTimes(1);
  expect((submitScene as jest.Mock).mock.calls[0][0].startImage).toBeUndefined();
  expect(submitOmniClip).not.toHaveBeenCalled();
});

it('a refused submit is refunded and the job row is failed', async () => {
  (submitScene as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'unavailable', retryable: true });
  const p = board();
  const res = await POST(post({ project: p, sceneId: 's1', expectedCredits: priceOf(p, 's1') }));
  expect(res.status).toBe(503);
  expect((await res.json()).refunded).toBe(true);
  expect(refundDebitByRef).toHaveBeenCalledTimes(1);
  expect(failJob).toHaveBeenCalled();
});

it('402 when the balance does not cover the scene', async () => {
  (hasSufficientBalance as jest.Mock).mockResolvedValueOnce(false);
  const p = board();
  expect((await POST(post({ project: p, sceneId: 's1', expectedCredits: priceOf(p, 's1') }))).status).toBe(402);
  expect(deductCredits).not.toHaveBeenCalled();
});
