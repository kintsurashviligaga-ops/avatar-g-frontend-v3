/** @jest-environment node */
/**
 * POST /api/orchestrate — the legacy agent text endpoint. Its text factory only knows OpenRouter / OpenAI / DeepSeek,
 * so a text-generation task is refused before any of them is chosen, any balance is read or anything is charged —
 * whatever the env says (the AI_GOOGLE_ONLY=0 kill switch is gone, MASTER TASK v3.1).
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
import { deductCredits, hasSufficientBalance } from '../../../lib/orchestrator/ledger';
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

test.each([{}, { AI_GOOGLE_ONLY: '0' }, { AI_GOOGLE_ONLY: '0', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-openai' }])(
  'env %p: 503 google_only; no outside model is chosen, no balance read, nothing charged',
  async (env) => {
    Object.assign(process.env, env);
    const res = await post();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'google_only' });
    expect(textProviderFactory.selectProvider).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(hasSufficientBalance).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
  },
);

test('signed out: 401', async () => {
  mockUser = null;
  expect((await post()).status).toBe(401);
});
