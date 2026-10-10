/** @jest-environment node */
/**
 * POST /api/orchestrate — the legacy agent text endpoint. Its text factory only knows OpenRouter / OpenAI / DeepSeek,
 * so under AI_GOOGLE_ONLY (on by default) a text-generation task is refused before any of them is chosen or anything
 * is charged. With the switch off it answers as before.
 */
jest.mock('server-only', () => ({}));
let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('../../../lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
    from: () => ({ insert: async () => ({ error: null }) }),
  }),
}));
jest.mock('../../../lib/orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCredits: jest.fn(async () => ({ ok: true, balance: 90 })),
}));
const mockGenerate = jest.fn(async () => ({ text: 'outside answer', model: 'gpt-x', tokens_in: 1, tokens_out: 1, cost_usd: 0, generation_time_ms: 1 }));
jest.mock('../../../lib/providers/text-factory', () => ({
  textProviderFactory: { selectProvider: jest.fn(() => ({ name: 'openai', generateText: mockGenerate })) },
}));
jest.mock('../../../lib/tools/registry', () => ({ toolRegistry: { executeTool: jest.fn() } }));
jest.mock('../../../lib/agents/registry', () => ({ getAgent: jest.fn(() => ({ id: 'writer' })) }));
jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { deductCredits } from '../../../lib/orchestrator/ledger';
import { textProviderFactory } from '../../../lib/providers/text-factory';
import { POST } from './route';

const ENV = { ...process.env };
const post = () => POST(new NextRequest('https://myavatar.ge/api/orchestrate', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ agentId: 'writer', taskType: 'text-generation', input: { prompt: 'hello' } }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV };
  delete process.env.AI_GOOGLE_ONLY;
  mockUser = { id: 'user-1' };
});
afterAll(() => { process.env = ENV; });

test('AI_GOOGLE_ONLY on (the default): 503 google_only; no outside model is chosen and nothing is charged', async () => {
  const res = await post();
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ error: 'google_only' });
  expect(textProviderFactory.selectProvider).not.toHaveBeenCalled();
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(deductCredits).not.toHaveBeenCalled();
});

test('AI_GOOGLE_ONLY off: it answers as before', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  const res = await post();
  expect(res.status).toBe(200);
  expect(mockGenerate).toHaveBeenCalledTimes(1);
});

test('signed out: 401', async () => {
  mockUser = null;
  expect((await post()).status).toBe(401);
});
