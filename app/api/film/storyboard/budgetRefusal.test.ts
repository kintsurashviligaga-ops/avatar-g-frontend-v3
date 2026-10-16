/** @jest-environment node */
/**
 * POST /api/film/storyboard — a frame the PLATFORM budget refused.
 *
 * ⚠️ 2026-10-16 (GG's 24 s board): the site's daily AI limit was spent, every frame call was refused, and the board
 * showed "1/3 ready, 2 will be created automatically" — retrying each frame, and promising a fill the limit made
 * impossible. A refused frame is now answered once, with which limit stopped it and when it lifts.
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
jest.mock('../../../../lib/services/billing/guardedCall', () => {
  class BudgetExceededError extends Error {
    reason: string;
    constructor(reason: string) { super(`budget_exceeded:${reason}`); this.reason = reason; }
  }
  return { BudgetExceededError, guardedCall: jest.fn() };
});

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateGeminiImage } from '../../../../lib/ai/geminiImage';
import { guardedCall, BudgetExceededError } from '../../../../lib/services/billing/guardedCall';

const image = generateGeminiImage as jest.Mock;
const guarded = guardedCall as jest.Mock;
const FRAME = { base64: Buffer.alloc(8, 1).toString('base64'), mimeType: 'image/jpeg' };
const refuse = () => { throw new (BudgetExceededError as unknown as new (r: string) => Error)('daily_limit'); };

function post(extra: Record<string, unknown>, locale = 'ka'): NextRequest {
  return new NextRequest('https://myavatar.ge/api/film/storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'A presenter on a black stage explains a product', orientation: 'vertical', locale, ...extra }),
  });
}

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.VIDEO_GOOGLE_ONLY;
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => fetchSpy.mockRestore());

describe('a frame the platform budget refused', () => {
  it('is asked once, and the answer names the daily limit and when it lifts', async () => {
    guarded.mockImplementation(async () => refuse());
    const body = await (await POST(post({ sceneOrdinal: 2, scenePrompt: 'Close-up: the presenter smiles' }))).json();
    expect(body).toMatchObject({ success: true, ordinal: 2, frameUrl: null, budgetRefused: true, budgetReason: 'daily_limit' });
    expect(body.budgetMessage).toContain('დღევანდელი AI ლიმიტი ამოიწურა');
    expect(body.budgetMessage).toContain('04:00');
    expect(guarded).toHaveBeenCalledTimes(1); // no second ask: it would get the same "no"
    expect(image).not.toHaveBeenCalled();
  });

  it('speaks the board language', async () => {
    guarded.mockImplementation(async () => refuse());
    const body = await (await POST(post({ sceneOrdinal: 2, scenePrompt: 'Close-up' }, 'en'))).json();
    expect(body.budgetMessage).toMatch(/Today's AI limit for the platform is used up/);
  });

  it('a drawn frame carries no budget note', async () => {
    guarded.mockImplementation(async (_o: unknown, fn: () => Promise<unknown>) => fn());
    image.mockResolvedValueOnce(FRAME);
    const body = await (await POST(post({ sceneOrdinal: 2, scenePrompt: 'Close-up' }))).json();
    expect(body.frameUrl).toBe('https://x.supabase.co/signed/frame.jpg');
    expect(body.budgetRefused).toBeUndefined();
  });

  it('an ordinary empty answer is still retried once, with no budget note', async () => {
    guarded.mockImplementation(async (_o: unknown, fn: () => Promise<unknown>) => fn());
    image.mockResolvedValue(null);
    const body = await (await POST(post({ sceneOrdinal: 2, scenePrompt: 'Close-up' }))).json();
    expect(body).toMatchObject({ success: true, frameUrl: null });
    expect(body.budgetRefused).toBeUndefined();
    expect(image).toHaveBeenCalledTimes(2);
  });

  it('the character anchor says the same', async () => {
    guarded.mockImplementation(async () => refuse());
    const body = await (await POST(post({ characterAnchor: true }))).json();
    expect(body).toMatchObject({ success: true, anchorUrl: null, budgetRefused: true });
  });
});
