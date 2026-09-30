/** @jest-environment node */
/**
 * POST /api/film/storyboard — signed-in only (lib/auth/generationGate).
 *
 * ⚠️ Every mode of this route spends the platform's keys — Gemini image frames, the director LLM, the vision
 * character-lock, uploads into our storage — and it used to have no session check at all: a direct POST could loop
 * frames on the Gemini balance. The studio stops a guest in the browser; this pins the SERVER refusal, and that it
 * happens BEFORE anything is spent (no LLM, no frame, no upload of an attached photo). Every provider module is mocked
 * so a regression surfaces as a recorded call, never as a network hit.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { STORYBOARD: { windowMs: 60_000, max: 30 }, AI: { windowMs: 60_000, max: 30 }, EXPENSIVE: { windowMs: 60_000, max: 5 } },
}));
jest.mock('../../../../lib/ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/ai/geminiImage', () => ({ generateGeminiImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/gemini/image-analysis', () => ({ describeCharacterFromImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/chat/promptAgent', () => ({ runPromptAgent: jest.fn(async () => null) }));
jest.mock('../../../../lib/chat/ServiceManager', () => ({
  ServiceManager: jest.fn().mockImplementation(() => ({ execute: jest.fn(), poll: jest.fn() })),
}));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://x.supabase.co/signed/ref.jpg') }));
jest.mock('../../../../lib/replicate/client', () => ({ createPrediction: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../../../../lib/services/billing/guardedCall', () => ({
  BudgetExceededError: class BudgetExceededError extends Error {},
  guardedCall: jest.fn(async (_o: unknown, fn: () => Promise<unknown>) => fn()),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { llmText } from '../../../../lib/ai/llmText';
import { generateGeminiImage } from '../../../../lib/ai/geminiImage';
import { describeCharacterFromImage } from '../../../../lib/gemini/image-analysis';
import { runPromptAgent } from '../../../../lib/chat/promptAgent';
import { uploadAndSign } from '../../../../lib/orchestrator/storage-adapter';
import { createPrediction } from '../../../../lib/replicate/client';
import { guardedCall } from '../../../../lib/services/billing/guardedCall';

const SELFIE = `data:image/jpeg;base64,${Buffer.alloc(64, 7).toString('base64')}`;

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest('https://myavatar.ge/api/film/storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ORIGINAL_FLAG = process.env.FILM_ALLOW_ANONYMOUS;
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});

afterEach(() => {
  fetchSpy.mockRestore();
  if (ORIGINAL_FLAG === undefined) delete process.env.FILM_ALLOW_ANONYMOUS;
  else process.env.FILM_ALLOW_ANONYMOUS = ORIGINAL_FLAG;
});

function expectNothingSpent(): void {
  expect(llmText).not.toHaveBeenCalled();
  expect(generateGeminiImage).not.toHaveBeenCalled();
  expect(describeCharacterFromImage).not.toHaveBeenCalled();
  expect(runPromptAgent).not.toHaveBeenCalled();
  expect(uploadAndSign).not.toHaveBeenCalled();
  expect(createPrediction).not.toHaveBeenCalled();
  expect(guardedCall).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
}

describe('anonymous caller → 401 authRequired, before any provider call', () => {
  it.each([
    ['the full board', {}],
    ['plan-only', { planOnly: true }],
    ['scripts-only (the director LLM)', { scriptsOnly: true }],
    ['the character anchor portrait', { characterAnchor: true }],
    ['a single-scene regenerate', { sceneOrdinal: 2, scenePrompt: 'she lights the lamp' }],
  ])('%s', async (_label, mode) => {
    const res = await POST(post({ prompt: 'A lighthouse keeper in a storm', referenceImages: [SELFIE], locale: 'en', ...mode }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      error: 'auth_required',
      authRequired: true,
      message: 'Sign in to create — generation needs an account.',
    });
    expect(authedClientFromRequest).toHaveBeenCalledTimes(1);
    // The attached photo is NOT hosted for a guest (hostRef would copy it into our bucket).
    expectNothingSpent();
  });

  it('answers in Georgian by default (no locale in the body)', async () => {
    const res = await POST(post({ prompt: 'ფილმი შუქურაზე' }));
    expect(res.status).toBe(401);
    expect((await res.json()).message).toMatch(/[Ⴀ-ჿ]/);
    expectNothingSpent();
  });
});

describe('the gate lets real (and explicitly re-opened) callers through', () => {
  it('a signed-in user reaches the plan (planOnly returns the deterministic board, no LLM)', async () => {
    mockUser = { id: 'user-1' };
    const res = await POST(post({ prompt: 'A lighthouse keeper in a storm', planOnly: true, sceneCount: 3, locale: 'en' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, planOnly: true });
    expect(body.authRequired).toBeUndefined();
    expect(Array.isArray(body.scenes)).toBe(true);
  });

  it('FILM_ALLOW_ANONYMOUS=1 re-opens it for a demo deployment', async () => {
    process.env.FILM_ALLOW_ANONYMOUS = '1';
    const res = await POST(post({ prompt: 'A lighthouse keeper in a storm', planOnly: true, sceneCount: 3 }));
    expect(res.status).toBe(200);
    expect((await res.json()).authRequired).toBeUndefined();
  });

  it('a missing prompt is still a 400 (validation is not masked by the gate)', async () => {
    const res = await POST(post({ prompt: '   ' }));
    expect(res.status).toBe(400);
    expectNothingSpent();
  });
});
