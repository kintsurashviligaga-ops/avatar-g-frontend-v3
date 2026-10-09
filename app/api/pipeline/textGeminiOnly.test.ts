/** @jest-environment node */
/**
 * POST /api/pipeline `generate` · the text services — Gemini ONLY (PROJECT_MASTER R7, "NO SILENT FALLBACK").
 *
 * ⚠️ A Gemini miss used to fall through to Claude (claude-sonnet-4-6) and then OpenAI (gpt-4o-mini), and the Terminal tool
 * ran Claude FIRST with Gemini only behind it — forbidden vendors writing the answer under a Gemini request. Pinned here:
 * every text service, the Terminal included, is answered by Gemini or by the route's explicit text error, and neither SDK
 * is ever used. The Anthropic SDK THROWS IF CONSTRUCTED (so even a module-level client fails the suite); the OpenAI client
 * has to construct — the voice leg's TTS builds it at load when OPENAI_API_KEY is set, and the key is set here so a
 * reinstated text leg would have a real client to call — but its chat endpoint throws if called. Every provider module is
 * mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000, keyPrefix: 'rl:exp' } },
}));
const mockAnthropicCtor = jest.fn(() => { throw new Error('the Anthropic SDK must never be constructed (R7)'); });
const mockClaudeCreate = jest.fn(async () => { throw new Error('Claude must never be called (R7)'); });
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: function Anthropic() { mockAnthropicCtor(); return { messages: { create: mockClaudeCreate } }; },
}));
const mockOpenAiChat = jest.fn(async () => { throw new Error('OpenAI chat must never be called (R7)'); });
const mockOpenAiSpeech = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: function OpenAI() { return { chat: { completions: { create: mockOpenAiChat } }, audio: { speech: { create: mockOpenAiSpeech } } }; },
}));
jest.mock('../../../lib/gemini/client', () => ({ generateWithGemini: jest.fn() }));
jest.mock('../../../lib/nanobanana/client', () => ({ generateNanoBananaImage: jest.fn() }));
jest.mock('../../../lib/udio/client', () => ({ generateUdioTrack: jest.fn() }));
jest.mock('../../../lib/worldlabs/client', () => ({ generateWorldLabsInterior: jest.fn() }));
jest.mock('../../../lib/chat/filmVoiceover', () => ({ textToHostedSpeech: jest.fn() }));
jest.mock('../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn() }));
jest.mock('../../../lib/ai/lipsync', () => ({ lipsyncCreate: jest.fn(), lipsyncFetch: jest.fn() }));
jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { generateWithGemini } from '../../../lib/gemini/client';

// Both keys exist BEFORE the route loads, so a reinstated Claude / OpenAI leg would be configured and reachable — the
// "never called" assertions below cannot pass merely because there was no client to fall back to.
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require('./route') as typeof import('./route');

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/pipeline', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const generate = (serviceId: string, userInput = 'Write something useful') => post({ action: 'generate', serviceId, userInput, locale: 'en' });

const TEXT_SERVICES = ['game', 'prompt-builder', 'terminal', 'terminal-coding', 'content-writer', 'podcast', 'character', 'event', 'tourism'];

const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  (generateWithGemini as jest.Mock).mockResolvedValue({ text: 'gemini text', model: 'gemini-2.5-flash' });
});
afterEach(() => {
  process.env = { ...ENV };
});

function expectNoClaudeNoOpenAi() {
  expect(mockAnthropicCtor).not.toHaveBeenCalled();
  expect(mockClaudeCreate).not.toHaveBeenCalled();
  expect(mockOpenAiChat).not.toHaveBeenCalled();
  expect(mockOpenAiSpeech).not.toHaveBeenCalled();
}

test.each(TEXT_SERVICES)('%s · Gemini fails → the explicit text error; Claude and OpenAI are never called', async (serviceId) => {
  (generateWithGemini as jest.Mock).mockRejectedValue(new Error('Gemini 503'));
  const res = await POST(generate(serviceId));
  expect(res.status).toBe(200);
  const j = await res.json();
  expect(j).toMatchObject({ status: 'error', error: 'Text generation unavailable: Gemini 503' });
  expect(j).not.toHaveProperty('result');
  expect(j).not.toHaveProperty('provider');
  expect(generateWithGemini).toHaveBeenCalledTimes(1);
  expectNoClaudeNoOpenAi();
});

test.each(TEXT_SERVICES)('%s · no Gemini key → the explicit text error, never another vendor', async (serviceId) => {
  delete process.env.GEMINI_API_KEY;
  const j = await (await POST(generate(serviceId))).json();
  expect(j).toMatchObject({ status: 'error', error: 'Text generation unavailable: GEMINI_API_KEY is not configured' });
  expect(generateWithGemini).not.toHaveBeenCalled();
  expectNoClaudeNoOpenAi();
});

test('the Terminal tool is answered by Gemini first and only (it used to be Claude-first)', async () => {
  const j = await (await POST(generate('terminal', 'A debounce hook in TypeScript'))).json();
  expect(j).toMatchObject({ status: 'done', serviceId: 'terminal', outputKind: 'code', provider: 'gemini', result: 'gemini text' });
  expect(generateWithGemini).toHaveBeenCalledTimes(1);
  const call = (generateWithGemini as jest.Mock).mock.calls[0][0] as { prompt: string };
  expect(call.prompt.startsWith('You are a Staff Engineer.')).toBe(true);
  expect(call.prompt).toContain('A debounce hook in TypeScript');
  expectNoClaudeNoOpenAi();
});

test('a text service Gemini answers is delivered under Gemini\'s name', async () => {
  const j = await (await POST(generate('content-writer'))).json();
  expect(j).toMatchObject({ status: 'done', outputKind: 'text', provider: 'gemini', result: 'gemini text' });
  expectNoClaudeNoOpenAi();
});
