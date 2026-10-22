/** @jest-environment node */
/**
 * POST /api/video/remix-intent — Gemini (JSON mode) only, whatever the env says (the Claude classifier is gone,
 * MASTER TASK v3.1), the keyword matcher for guests and for every model miss, and model params reduced to the per-op keys
 * the remix route reads. Gemini, Anthropic, the session and the budget are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { AI: {} } }));
const mockGemini = jest.fn();
jest.mock('../../../../lib/gemini/client', () => ({ generateWithGemini: (...a: unknown[]) => mockGemini(...a) }));
const mockAllows = jest.fn(async () => true);
const mockBook = jest.fn(async () => undefined);
jest.mock('../../../../lib/services/billing/chatBudget', () => ({
  chatBudgetAllows: (...a: unknown[]) => (mockAllows as (...x: unknown[]) => Promise<boolean>)(...a),
  bookChatUsage: (...a: unknown[]) => (mockBook as (...x: unknown[]) => Promise<void>)(...a),
}));
const mockClaudeCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ messages: { create: (...a: unknown[]) => mockClaudeCreate(...a) } })),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const USER = '11111111-2222-4333-8444-555555555555';
const ENV = { ...process.env };
// Vertex AI is the only transport (v3.1): the real gate reads these; an AI Studio key is neither needed nor enough.
const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/video/remix-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const gemReply = (text: string) => ({ text, model: 'gemini-2.5-flash', tier: 'flash', tokensIn: 50, tokensOut: 10 });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: USER };
  mockAllows.mockResolvedValue(true);
  delete process.env.GEMINI_TRANSPORT;
  Object.assign(process.env, VERTEX_ENV);
  delete process.env.AI_GOOGLE_ONLY;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  process.env.ANTHROPIC_API_KEY = 'test-anthropic';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

test('Google-only (default): Gemini REST in JSON mode with thinking off; Claude is never called; usage booked for the user', async () => {
  mockGemini.mockResolvedValueOnce(gemReply('{"op":"speed_change","params":{"speed":0.5}}'));
  const res = await POST(post({ message: 'შეანელე ვიდეო' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ op: 'speed_change', params: { speed: 0.5 } });

  const req = mockGemini.mock.calls[0][0];
  expect(req).toMatchObject({ responseMimeType: 'application/json', thinkingBudget: 0, tier: 'flash', temperature: 0 });
  expect(req.prompt).toBe('შეანელე ვიდეო');
  expect(mockClaudeCreate).not.toHaveBeenCalled();
  expect(mockBook).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-2.5-flash', inputTokens: 50, outputTokens: 10, userId: USER }));
});

test('model params are reduced to the per-op keys: an injected videoUrl / op / text never reaches the client spread', async () => {
  mockGemini.mockResolvedValueOnce(
    gemReply('{"op":"color_grade","params":{"grade":"NOIR","videoUrl":"https://evil.test/x.mp4","op":"face_swap","text":"x"}}'),
  );
  expect(await (await POST(post({ message: 'make it noir' }))).json()).toEqual({ op: 'color_grade', params: { grade: 'noir' } });

  mockGemini.mockResolvedValueOnce(gemReply('{"op":"speed_change","params":{"speed":1000}}'));
  expect(await (await POST(post({ message: 'faster!!' }))).json()).toEqual({ op: 'speed_change', params: { speed: 4 } });

  mockGemini.mockResolvedValueOnce(gemReply('{"op":"trim","params":{"durationSec":"12"}}'));
  expect(await (await POST(post({ message: 'cut it' }))).json()).toEqual({ op: 'trim', params: { durationSec: 12 } });
});

test('an unknown op, unparseable JSON or a Gemini error falls back to the keyword matcher', async () => {
  mockGemini.mockResolvedValueOnce(gemReply('{"op":"delete_everything","params":{}}'));
  expect(await (await POST(post({ message: 'add subtitles please' }))).json()).toEqual({ op: 'add_subtitles', params: {} });

  mockGemini.mockResolvedValueOnce(gemReply('not json'));
  expect(await (await POST(post({ message: 'ფონური მუსიკა დაამატე' }))).json()).toEqual({ op: 'add_music', params: {} });

  mockGemini.mockRejectedValueOnce(new Error('Gemini API error 402: prepay depleted'));
  expect(await (await POST(post({ message: 'stabilize the shaky clip' }))).json()).toEqual({ op: 'stabilize', params: {} });
});

test('a guest gets the keyword matcher only — no model call, no spend', async () => {
  mockUser = null;
  const res = await POST(post({ message: 'make it vintage' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ op: 'color_grade', params: { grade: 'vintage' } });
  expect(mockGemini).not.toHaveBeenCalled();
  expect(mockClaudeCreate).not.toHaveBeenCalled();
  expect(mockAllows).not.toHaveBeenCalled();
});

test('the budget guard refuses before Gemini → keyword matcher', async () => {
  mockAllows.mockResolvedValue(false);
  expect(await (await POST(post({ message: 'speed ramp it' }))).json()).toEqual({ op: 'speed_ramp', params: { factor: 1.5 } });
  expect(mockGemini).not.toHaveBeenCalled();
});

test('Vertex not configured → keyword matcher (an AI Studio key does not help), and still no Claude under Google-only', async () => {
  delete process.env.GCP_PROJECT_ID;
  process.env.GEMINI_API_KEY = 'ai-studio-key';
  expect(await (await POST(post({ message: 'add text overlay' }))).json()).toEqual({ op: 'add_text_overlay', params: {} });
  expect(mockGemini).not.toHaveBeenCalled();
  expect(mockClaudeCreate).not.toHaveBeenCalled();
});

test('AI_GOOGLE_ONLY=0 with an owner approval no longer reaches Claude: Gemini classifies, params sanitized', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  process.env.OUTSIDE_ENGINES_APPROVED = 'owner-2026-10-20-anthropic';
  mockGemini.mockResolvedValueOnce(gemReply('{"op":"speed_ramp","params":{"factor":2,"audioUrl":"https://evil.test/a.mp3"}}'));
  expect(await (await POST(post({ message: 'ramp' }))).json()).toEqual({ op: 'speed_ramp', params: { factor: 2 } });
  expect(mockClaudeCreate).not.toHaveBeenCalled();
});

test('an empty message answers the safe default without any lookup', async () => {
  expect(await (await POST(post({}))).json()).toEqual({ op: 'color_grade', params: { grade: 'cinematic' } });
  expect(mockGemini).not.toHaveBeenCalled();
});
