/** @jest-environment node */
/**
 * POST /api/chat/orchestrate — the film's (sceneCount, clipSec) pair is judged by the picker's grid (lib/video/duration).
 *
 * The film is priced from `sceneCount × clipSec` before any clip is dispatched, and Veo renders 4 / 6 / 8 s clips only. A
 * `clipSec` of 5 was therefore billed as 5 s and delivered 6 s. The route snaps it to what will render, forwards every pair
 * the picker itself produces untouched (a 4 s or 6 s single clip keeps its real length), and refuses a film no pipeline
 * here can hold. The orchestrator is mocked: this pins the boundary, not the render.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: { userId: 'user-1' }, budgetRemaining: null })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: { READ: { maxRequests: 60, windowMs: 60_000 }, WRITE: { maxRequests: 30, windowMs: 60_000 } },
}));
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' }, supabase: {} })),
  createRouteHandlerClient: jest.fn(),
}));
jest.mock('../../../../lib/chat/providerRouter', () => ({
  orchestrate: jest.fn(async () => ({ success: true, intent: 'video_generation', responseType: 'video', message: 'queued' })),
  pollOrchestrationTask: jest.fn(),
}));
jest.mock('../../../../lib/chat/userMemory', () => ({
  getUserProfileFacts: jest.fn(async () => []),
  buildProfilePreamble: jest.fn(() => ''),
  extractProfileFacts: jest.fn(() => []),
  saveUserProfileFacts: jest.fn(async () => undefined),
}));
jest.mock('../../../../lib/rag/retrieve', () => ({ retrieveContext: jest.fn(async () => '') }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { orchestrate } from '../../../../lib/chat/providerRouter';
import { VIDEO_DURATION_STOPS, clipSecForSeconds, sceneCountForSeconds, videoRoute } from '../../../../lib/video/duration';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/chat/orchestrate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const RENDER = {
  message: 'A detective waits for an informant on a rain-soaked pier at midnight',
  serviceContext: 'video',
  locale: 'en',
  orientation: 'landscape',
  style: 'Noir',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

async function forwarded(extra: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await POST(post({ ...RENDER, ...extra }));
  expect(res.status).toBe(200);
  expect(orchestrate).toHaveBeenCalledTimes(1);
  return (orchestrate as jest.Mock).mock.calls[0][0].metadata as Record<string, unknown>;
}

test.each(VIDEO_DURATION_STOPS.filter((s) => videoRoute(s) !== 'longform'))(
  'the picker’s own %i s film passes untouched: its real scene count and clip length reach the render',
  async (sec) => {
    const md = await forwarded({ sceneCount: sceneCountForSeconds(sec), clipSec: clipSecForSeconds(sec) });
    expect(md).toMatchObject({ sceneCount: sceneCountForSeconds(sec), clipSec: clipSecForSeconds(sec) });
  },
);

test('a clip length Veo cannot render is snapped before the render (5 → 6): the billed seconds are the delivered seconds', async () => {
  expect(await forwarded({ sceneCount: 5, clipSec: 5 })).toMatchObject({ sceneCount: 5, clipSec: 6 });
});

test('7 → 8, the other half of the same rule', async () => {
  expect(await forwarded({ sceneCount: 3, clipSec: 7 })).toMatchObject({ sceneCount: 3, clipSec: 8 });
});

test('a script cadence (4 × 6 s) is a real film and goes through as written', async () => {
  expect(await forwarded({ sceneCount: 4, clipSec: 6 })).toMatchObject({ sceneCount: 4, clipSec: 6 });
});

test('a request that names neither field is the server’s own default and is not judged', async () => {
  const md = await forwarded({});
  expect(md).not.toHaveProperty('clipSec');
  expect(md).not.toHaveProperty('sceneCount');
});

test.each([
  ['more scenes than the film pipeline holds (13 × 8 s = 104 s is the long-form route)', { sceneCount: 13, clipSec: 8 }],
  ['a clip longer than a Veo scene', { sceneCount: 1, clipSec: 12 }],
  ['a fractional length', { sceneCount: 2, clipSec: 5.5 }],
])('%s is refused with a 400 and never reaches the orchestrator', async (_label, extra) => {
  const res = await POST(post({ ...RENDER, ...extra }));
  expect(res.status).toBe(400);
  expect(orchestrate).not.toHaveBeenCalled();
});
