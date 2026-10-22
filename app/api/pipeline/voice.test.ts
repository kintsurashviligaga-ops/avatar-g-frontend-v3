/** @jest-environment node */
/**
 * POST /api/pipeline `generate` · voice — the /services/voice voiceover.
 *
 * ⚠️ It ran on ElevenLabs (with an OpenAI voice behind it until MASTER TASK v3.1) and spoke the TEXT-MODEL prompt. The
 * wizard's voice leg has no Google engine and no charge of its own, so it is refused (503 google_only, the body the
 * studio already renders) before any voice is made, whatever MEDIA_GOOGLE_ONLY or AI_GOOGLE_ONLY says. Voiceovers are
 * made in the studio. Pinned here: nothing reaches ElevenLabs or OpenAI under any env value.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'u1' } })) }));
const mockSpeech = jest.fn();
jest.mock('openai', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ audio: { speech: { create: mockSpeech } } })) }));
jest.mock('../../../lib/gemini/client', () => ({ generateWithGemini: jest.fn() }));
jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';

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

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ELEVENLABS_API_KEY = 'test-el-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(new Uint8Array(4096), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test.each([
  {},
  { MEDIA_GOOGLE_ONLY: '0' },
  { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-elevenlabs' },
  { AI_GOOGLE_ONLY: '0', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-openai' },
])('env %p: the voiceover is refused google_only before any voice is made — no ElevenLabs, no OpenAI', async (env) => {
  Object.assign(process.env, env);
  const res = await POST(voice('გამარჯობა, ეს არის ჩემი პირველი გახმოვანება.'));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ success: false, url: null, code: 'google_only', error: 'google_only' });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(mockSpeech).not.toHaveBeenCalled();
});
