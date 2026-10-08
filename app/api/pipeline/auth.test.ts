/** @jest-environment node */
/**
 * POST /api/pipeline — `generate` is signed in only; the wizard's local steps stay open.
 *
 * ⚠️ `generate` reaches every key the platform has — Gemini for the text services (only Gemini since R7: no Claude /
 * OpenAI fallback — textGeminiOnly.test.ts), Nano Banana, LTX, HeyGen + ElevenLabs, World Labs, Udio — and it had no
 * session check at all. Pinned here:
 *   · a guest `generate` → 401 before any provider (Gemini, Claude, or anything reached through fetch);
 *   · a guest can still walk detect_intent / get_questions / confirm (local lookups, no spend);
 *   · a signed-in `generate` passes the gate and reaches the text brain.
 * Every provider module is mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('@anthropic-ai/sdk', () => {
  const create = jest.fn(async () => ({ content: [{ type: 'text', text: 'claude text' }], usage: { input_tokens: 1, output_tokens: 1 } }));
  return { __esModule: true, default: jest.fn().mockImplementation(() => ({ messages: { create } })), __create: create };
});
jest.mock('openai', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../../lib/gemini/client', () => ({ generateWithGemini: jest.fn(async () => ({ text: 'gemini text', model: 'gemini-2.5-pro' })) }));
jest.mock('../../../lib/nanobanana/client', () => ({ generateNanoBananaImage: jest.fn() }));
jest.mock('../../../lib/udio/client', () => ({ generateUdioTrack: jest.fn() }));
jest.mock('../../../lib/worldlabs/client', () => ({ generateWorldLabsInterior: jest.fn() }));
jest.mock('../../../lib/chat/filmVoiceover', () => ({ textToHostedSpeech: jest.fn() }));
jest.mock('../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn() }));
jest.mock('../../../lib/ai/lipsync', () => ({ lipsyncCreate: jest.fn(), lipsyncFetch: jest.fn() }));
jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateWithGemini } from '../../../lib/gemini/client';

const { __create: claudeCreate } = jest.requireMock('@anthropic-ai/sdk') as { __create: jest.Mock };

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/pipeline', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const GENERATE = { action: 'generate', serviceId: 'content-writer', userInput: 'A launch post for a Tbilisi coffee shop', locale: 'en' };
const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test('a guest `generate` is refused (401 auth_required) before Gemini, Claude or any fetch-reached provider', async () => {
  const res = await POST(post(GENERATE));
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ success: false, error: 'auth_required', authRequired: true });
  expect(generateWithGemini).not.toHaveBeenCalled();
  expect(claudeCreate).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a guest `generate` for a media service (HeyGen avatar) is refused the same way', async () => {
  const res = await POST(post({ action: 'generate', serviceId: 'avatar', userInput: 'Say hello', locale: 'ka' }));
  expect(res.status).toBe(401);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('the free wizard steps stay open to a guest (no provider involved)', async () => {
  const res = await POST(post({ action: 'detect_intent', userInput: 'write a blog article', locale: 'en' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ detected: true, serviceId: 'content-writer' });
  expect(generateWithGemini).not.toHaveBeenCalled();
});

test('a signed-in `generate` passes the gate and reaches the text brain', async () => {
  mockUser = { id: 'user-1' };
  const res = await POST(post(GENERATE));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'done', provider: 'gemini', result: 'gemini text' });
  expect(generateWithGemini).toHaveBeenCalledTimes(1);
});
