/** @jest-environment node */
/**
 * POST /api/film/storyboard { characterAnchor: true } — the portrait every storyboard frame is then locked to.
 *
 * ⚠️ A brief with NO person in it must not get one. The paid Production film of 2026-10-15 ("a red paper boat drifts
 * across a pond to a dock where a grey cat watches") came back with an invented woman in every frame and both clips:
 * the anchor asked the image model for "a head-and-shoulders close-up of the main character", and each frame was drawn
 * "featuring the EXACT same person as the reference image". What must hold: a clear "no person" → no portrait, no image
 * call, `anchorUrl: null`; a person, or an unknown answer, or an uploaded photo → the portrait as before.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { STORYBOARD: { windowMs: 60_000, max: 30 }, AI: { windowMs: 60_000, max: 30 }, EXPENSIVE: { windowMs: 60_000, max: 5 } },
}));
jest.mock('../../../../lib/ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/ai/geminiImage', () => ({
  generateGeminiImage: jest.fn(async () => ({ base64: Buffer.alloc(8, 1).toString('base64'), mimeType: 'image/jpeg' })),
}));
jest.mock('../../../../lib/gemini/image-analysis', () => ({ describeCharacterFromImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/chat/promptAgent', () => ({ runPromptAgent: jest.fn(async () => null), promptAgentModel: () => 'gemini-test-flash' }));
jest.mock('../../../../lib/chat/ServiceManager', () => ({
  ServiceManager: jest.fn().mockImplementation(() => ({ execute: jest.fn(), poll: jest.fn() })),
}));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://x.supabase.co/signed/anchor.jpg') }));
jest.mock('../../../../lib/replicate/client', () => ({ createPrediction: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../../../../lib/services/billing/guardedCall', () => ({
  BudgetExceededError: class BudgetExceededError extends Error {},
  guardedCall: jest.fn(async (_o: unknown, fn: () => Promise<unknown>) => fn()),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { llmText } from '../../../../lib/ai/llmText';
import { generateGeminiImage } from '../../../../lib/ai/geminiImage';
import { createPrediction } from '../../../../lib/replicate/client';

const BOAT_AND_CAT = 'A red paper boat drifts across a calm pond at sunrise, then reaches a small wooden dock where a grey cat watches it, soft ripples, birds singing.';
const LIGHTHOUSE_KEEPER = 'A lighthouse keeper climbs the stairs in a storm and lights the lamp.';
const SELFIE = `data:image/jpeg;base64,${Buffer.alloc(64, 7).toString('base64')}`;

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest('https://myavatar.ge/api/film/storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orientation: 'vertical', locale: 'en', sceneCount: 2, characterAnchor: true, ...body }),
  });
}

const llm = llmText as jest.MockedFunction<typeof llmText>;
let fetchSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.VIDEO_GOOGLE_ONLY; // default on → the Gemini image path, the one Production uses
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  fetchSpy.mockRestore();
  logSpy.mockRestore();
});

describe('no person in the brief → no portrait', () => {
  it('the boat-and-cat brief: anchorUrl null, no image call, nothing uploaded', async () => {
    llm.mockResolvedValueOnce('{"person": false}');
    const res = await POST(post({ prompt: BOAT_AND_CAT }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, anchorUrl: null, anchorSkipped: 'no_person' });
    expect(generateGeminiImage).not.toHaveBeenCalled();
    expect(createPrediction).not.toHaveBeenCalled();
    // The classifier saw the brief itself, once.
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm.mock.calls[0]![0].user).toContain('red paper boat');
    expect(llm.mock.calls[0]![0].json).toBe(true);
  });

  it('a Georgian brief the classifier answers "no" for is skipped the same way', async () => {
    llm.mockResolvedValueOnce('{"person":false}');
    const res = await POST(post({ prompt: 'წითელი ქაღალდის ნავი გადის მშვიდ ტბაზე, ნაპირზე ნაცრისფერი კატა უყურებს' }));
    expect((await res.json()).anchorUrl).toBeNull();
    expect(generateGeminiImage).not.toHaveBeenCalled();
  });
});

describe('a person, an unknown answer or an uploaded photo → the portrait, as before', () => {
  it('a person in the brief → one portrait, returned as anchorUrl', async () => {
    llm.mockResolvedValueOnce('{"person": true}');
    const res = await POST(post({ prompt: LIGHTHOUSE_KEEPER }));
    const body = await res.json();
    expect(body).toMatchObject({ success: true, anchorUrl: 'https://x.supabase.co/signed/anchor.jpg' });
    expect(body.anchorSkipped).toBeUndefined();
    expect(generateGeminiImage).toHaveBeenCalledTimes(1);
    expect((generateGeminiImage as jest.Mock).mock.calls[0][0].prompt).toMatch(/Character reference portrait/);
  });

  it.each([
    ['Gemini missed (null)', null],
    ['an unreadable answer', 'maybe, it depends'],
  ])('%s → the portrait is still drawn (a flaky classifier never drops an identity lock)', async (_label, answer) => {
    llm.mockResolvedValueOnce(answer as string | null);
    const res = await POST(post({ prompt: LIGHTHOUSE_KEEPER }));
    expect((await res.json()).anchorUrl).toBe('https://x.supabase.co/signed/anchor.jpg');
    expect(generateGeminiImage).toHaveBeenCalledTimes(1);
  });

  it('an uploaded photo: the classifier is not asked at all', async () => {
    const res = await POST(post({ prompt: BOAT_AND_CAT, referenceImages: [SELFIE] }));
    expect(res.status).toBe(200);
    expect(llm).not.toHaveBeenCalled();
    expect(generateGeminiImage).toHaveBeenCalledTimes(1);
  });
});
