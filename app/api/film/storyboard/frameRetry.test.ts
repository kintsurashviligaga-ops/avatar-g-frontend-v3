/** @jest-environment node */
/**
 * POST /api/film/storyboard { sceneOrdinal } — the per-scene frame call retries once on an empty answer.
 *
 * ⚠️ The board asks for every frame through this path. On 2026-10-16 Gemini's image model answered
 * finishReason=NO_IMAGE for scene 4 of two consecutive 4-scene boards; the tile stayed empty (frame chaining off for
 * the whole film) until a manual re-roll drew it. One more try, never more.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { STORYBOARD: { windowMs: 60_000, max: 30 }, AI: { windowMs: 60_000, max: 30 }, EXPENSIVE: { windowMs: 60_000, max: 5 } },
}));
jest.mock('../../../../lib/ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/ai/geminiImage', () => ({ generateGeminiImage: jest.fn() }));
jest.mock('../../../../lib/gemini/image-analysis', () => ({ describeCharacterFromImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/chat/promptAgent', () => ({ runPromptAgent: jest.fn(async () => null), promptAgentModel: () => 'gemini-test-flash' }));
jest.mock('../../../../lib/chat/ServiceManager', () => ({
  ServiceManager: jest.fn().mockImplementation(() => ({ execute: jest.fn(), poll: jest.fn() })),
}));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://x.supabase.co/signed/frame.jpg') }));
jest.mock('../../../../lib/replicate/client', () => ({ createPrediction: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../../../../lib/services/billing/guardedCall', () => ({
  BudgetExceededError: class BudgetExceededError extends Error {},
  guardedCall: jest.fn(async (_o: unknown, fn: () => Promise<unknown>) => fn()),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateGeminiImage } from '../../../../lib/ai/geminiImage';

const image = generateGeminiImage as jest.Mock;
const FRAME = { base64: Buffer.alloc(8, 1).toString('base64'), mimeType: 'image/jpeg' };

function post(extra: Record<string, unknown> = { sceneCount: 4, sceneOrdinal: 4 }): NextRequest {
  return new NextRequest('https://myavatar.ge/api/film/storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'A presenter on a black stage explains a product', orientation: 'vertical', locale: 'en', ...extra }),
  });
}

// The board's own frame call, as OmniStudio sends it: the scene's prompt and NO sceneCount.
const SHOT_4 = 'Medium shot: the presenter finishes the pitch and invites the viewer, one hand open toward camera';
const boardFrame4 = () => post({ sceneOrdinal: 4, scenePrompt: SHOT_4, referenceImages: [] });

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.VIDEO_GOOGLE_ONLY; // default on → the Gemini image path, the one Production uses
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => fetchSpy.mockRestore());

describe('single-scene frame', () => {
  it('an empty first answer → one retry, and its frame is returned', async () => {
    image.mockResolvedValueOnce(null).mockResolvedValueOnce(FRAME);
    const body = await (await POST(post())).json();
    expect(body).toMatchObject({ success: true, ordinal: 4, frameUrl: 'https://x.supabase.co/signed/frame.jpg' });
    expect(image).toHaveBeenCalledTimes(2);
  });

  it('a frame on the first try → no second call', async () => {
    image.mockResolvedValueOnce(FRAME);
    const body = await (await POST(post())).json();
    expect(body.frameUrl).toBe('https://x.supabase.co/signed/frame.jpg');
    expect(image).toHaveBeenCalledTimes(1);
  });

  it('two empty answers → an empty tile, never a third call', async () => {
    image.mockResolvedValue(null);
    const body = await (await POST(post())).json();
    expect(body).toMatchObject({ success: true, ordinal: 4, frameUrl: null });
    expect(image).toHaveBeenCalledTimes(2);
  });
});

// 2026-10-16, GG's 32 s ad test: tile 4 of every 4-scene board stayed empty. The board's frame calls send no sceneCount,
// so the route planned the default 3 scenes, scene 4 failed `ordinal <= plan.scenes.length` and the call ran the WHOLE
// board instead (three more frames on the image quota, then an answer with no frameUrl). Each re-roll repeated it.
describe('a frame call never runs the whole board', () => {
  it('scene 4 of a 4-scene board (no sceneCount, as the board sends it) → ONE frame from its own scene prompt', async () => {
    image.mockResolvedValue(FRAME);
    const res = await POST(boardFrame4());
    const body = await res.json();
    expect(body).toMatchObject({ success: true, ordinal: 4, frameUrl: 'https://x.supabase.co/signed/frame.jpg' });
    expect(body.scenes).toBeUndefined();
    expect(image).toHaveBeenCalledTimes(1);
    expect(image.mock.calls[0][0].prompt).toContain(SHOT_4);
  });

  it('scenes past the default plan up to 12 are frames too', async () => {
    image.mockResolvedValue(FRAME);
    for (const ordinal of [5, 6, 12]) {
      const body = await (await POST(post({ sceneOrdinal: ordinal, scenePrompt: `shot ${ordinal}` }))).json();
      expect(body).toMatchObject({ success: true, ordinal, frameUrl: 'https://x.supabase.co/signed/frame.jpg' });
    }
    expect(image).toHaveBeenCalledTimes(3);
  });

  it('an ordinal past the plan with no scene prompt → 400, nothing drawn', async () => {
    const res = await POST(post({ sceneOrdinal: 4 }));
    expect(res.status).toBe(400);
    expect(image).not.toHaveBeenCalled();
  });

  it('a malformed ordinal → 400, nothing drawn (it used to run the whole board)', async () => {
    for (const sceneOrdinal of [0, -1, 2.5, 13, 'x']) {
      const res = await POST(post({ sceneOrdinal, scenePrompt: 'a shot' }));
      expect(res.status).toBe(400);
    }
    expect(image).not.toHaveBeenCalled();
  });

  it('within the plan and no scene prompt → the planned scene, as before', async () => {
    image.mockResolvedValue(FRAME);
    const body = await (await POST(post({ sceneOrdinal: 2 }))).json();
    expect(body).toMatchObject({ success: true, ordinal: 2, frameUrl: 'https://x.supabase.co/signed/frame.jpg' });
    expect(image).toHaveBeenCalledTimes(1);
  });
});
