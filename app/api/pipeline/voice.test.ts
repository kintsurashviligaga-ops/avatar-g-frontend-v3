/** @jest-environment node */
/**
 * POST /api/pipeline `generate` · voice — the /services/voice voiceover.
 *
 * ⚠️ It used to speak the TEXT-MODEL prompt: „Synthesize the following text in ka with a neutral tone:" (the clarifier's
 * wrapper) and, on a second short request in the same session, the previous text plus „Refinement request: …" (the
 * iteration store). Pinned here: ElevenLabs receives exactly what the user typed, every time; and with the Google-only
 * switch on (the default) a failed ElevenLabs call is an error, not a silent OpenAI voice (PROJECT_MASTER §A, R7).
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ messages: { create: jest.fn() } })) }));
const mockSpeech = jest.fn();
jest.mock('openai', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ audio: { speech: { create: mockSpeech } } })) }));
jest.mock('../../../lib/gemini/client', () => ({ generateWithGemini: jest.fn() }));
jest.mock('../../../lib/nanobanana/client', () => ({ generateNanoBananaImage: jest.fn() }));
jest.mock('../../../lib/udio/client', () => ({ generateUdioTrack: jest.fn() }));
jest.mock('../../../lib/worldlabs/client', () => ({ generateWorldLabsInterior: jest.fn() }));
jest.mock('../../../lib/chat/filmVoiceover', () => ({ textToHostedSpeech: jest.fn() }));
jest.mock('../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn() }));
jest.mock('../../../lib/ai/lipsync', () => ({ lipsyncCreate: jest.fn(), lipsyncFetch: jest.fn() }));
jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';

// The route builds its OpenAI client at load time, so the key must exist before it is required — otherwise the
// "no silent OpenAI" test would pass only because there was no client to fall back to.
process.env.OPENAI_API_KEY = 'test-openai-key';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require('./route') as typeof import('./route');

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/pipeline', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const voice = (userInput: string, sessionId = 's-voice') =>
  post({ action: 'generate', serviceId: 'voice', sessionId, userInput, answers: { voice_style: 'warm', text_lang: 'ka' }, locale: 'ka' });

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;
const spokenTexts = () =>
  fetchSpy.mock.calls
    .filter(([url]) => String(url).includes('api.elevenlabs.io/v1/text-to-speech/'))
    .map(([, init]) => (JSON.parse(String((init as RequestInit).body)) as { text: string }).text);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ELEVENLABS_API_KEY = 'test-el-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  delete process.env.AI_GOOGLE_ONLY;
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(new Uint8Array(4096), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test('ElevenLabs speaks exactly what the user typed — no instruction wrapper', async () => {
  const res = await POST(voice('გამარჯობა, ეს არის ჩემი პირველი გახმოვანება.'));
  expect(await res.json()).toMatchObject({ status: 'done', outputKind: 'audio' });
  expect(spokenTexts()).toEqual(['გამარჯობა, ეს არის ჩემი პირველი გახმოვანება.']);
});

test('a second short voiceover in the same session is not merged with the first', async () => {
  await POST(voice('პირველი ტექსტი.', 's-merge'));
  await POST(voice('მეორე ტექსტი.', 's-merge'));
  expect(spokenTexts()).toEqual(['პირველი ტექსტი.', 'მეორე ტექსტი.']);
});

test('a failed ElevenLabs call is an error, never a silent OpenAI voice (Google-only switch on)', async () => {
  fetchSpy.mockImplementation(async () => new Response('nope', { status: 500 }));
  const res = await POST(voice('Hello there.'));
  expect(await res.json()).toMatchObject({ status: 'error' });
  expect(mockSpeech).not.toHaveBeenCalled();
});

test('the OpenAI voice is reachable only through the kill switch (AI_GOOGLE_ONLY=0)', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  fetchSpy.mockImplementation(async () => new Response('nope', { status: 500 }));
  mockSpeech.mockResolvedValue({ arrayBuffer: async () => new Uint8Array(8).buffer });
  const res = await POST(voice('Hello there.'));
  expect(await res.json()).toMatchObject({ status: 'done', outputKind: 'audio' });
  expect(mockSpeech).toHaveBeenCalledWith(expect.objectContaining({ input: 'Hello there.' }));
});
