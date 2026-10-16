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

function post(): NextRequest {
  return new NextRequest('https://myavatar.ge/api/film/storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'A presenter on a black stage explains a product', orientation: 'vertical', locale: 'en', sceneCount: 4, sceneOrdinal: 4 }),
  });
}

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
