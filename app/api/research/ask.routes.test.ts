/** @jest-environment node */
/**
 * POST /api/research/[id]/ask — owner-only, only for a FINISHED report, budget-gated, rate-limited, and a provider error never
 * reaches the body. The model is a mock; the store is the real one over an in-memory database.
 */
jest.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { FakeDb } from '@/lib/research/testing/fakeDb';
import { RESEARCH_DB_OPTIONS } from '@/lib/research/testing/fakes';

let mockUser: string | null = 'u1';
let mockDb: FakeDb;
const mockRate = jest.fn();
const mockGenerate = jest.fn();
const mockBudget = jest.fn();
const mockBook = jest.fn();

jest.mock('../../../lib/supabase/server', () => ({
  authedClientFromRequest: async () => ({ supabase: {}, user: mockUser ? { id: mockUser } : null }),
  createServiceRoleClient: () => mockDb,
}));
jest.mock('../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundDebitByRef: jest.fn() }));
jest.mock('../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: { CHAT_USER: { maxRequests: 500, windowMs: 86_400_000, keyPrefix: 'rl:chat:user' } },
  checkRateLimit: async () => null,
  checkRateLimitByKey: (...a: unknown[]) => mockRate(...a),
}));
jest.mock('../../../lib/gemini/client', () => ({ generateWithGemini: (...a: unknown[]) => mockGenerate(...a), GEMINI_MODELS: { flash: 'gemini-3.8-flash', pro: 'gemini-3.1-pro-preview' } }));
jest.mock('../../../lib/services/billing/chatBudget', () => ({ chatBudgetAllows: (...a: unknown[]) => mockBudget(...a), bookChatUsage: (...a: unknown[]) => mockBook(...a) }));
jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../lib/observability/reliability', () => ({ opsMarker: jest.fn() }));

import { POST } from './[id]/ask/route';

const ID = '22222222-2222-4222-8222-222222222222';
const post = (body: unknown, id = ID) => POST(new NextRequest(`https://myavatar.ge/api/research/${id}/ask`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { params: { id } });

function seed(over: Record<string, unknown> = {}) {
  mockDb.rows('research_jobs').push({
    id: ID, user_id: 'u1', status: 'completed', title: 'Wine exports', report_md: '# Wine\n\n## Findings\n\nThree markets.', prompt: 'p', locale: 'en',
    ...over,
  });
}

beforeEach(() => {
  mockUser = 'u1';
  mockDb = new FakeDb({}, RESEARCH_DB_OPTIONS);
  mockRate.mockReset().mockResolvedValue(null);
  mockBudget.mockReset().mockResolvedValue(true);
  mockBook.mockReset().mockResolvedValue(undefined);
  mockGenerate.mockReset().mockResolvedValue({ text: 'Three markets dominate.', model: 'gemini-3.8-flash', tokensIn: 500, tokensOut: 20 });
});

describe('POST /api/research/[id]/ask', () => {
  test('answers from the stored report: a flash call, thinking off, bounded, usage booked for the user', async () => {
    seed();
    const r = await post({ question: 'How many markets?', locale: 'en' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ answer: 'Three markets dominate.', truncated: false });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const arg = mockGenerate.mock.calls[0]![0];
    expect(arg).toMatchObject({ tier: 'flash', thinkingBudget: 0, maxTokens: 1_200 });
    expect(arg.timeoutMs).toBeLessThanOrEqual(12_000);
    expect(arg.prompt).toContain('Three markets.');
    expect(mockBudget).toHaveBeenCalledTimes(1);
    expect(mockBook).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', model: 'gemini-3.8-flash' }));
  });

  test('summarize / takeaways need no question', async () => {
    seed();
    expect((await post({ mode: 'summarize' })).status).toBe(200);
    expect((await post({ mode: 'takeaways' })).status).toBe(200);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  test('a guest → 401; somebody else\'s report and a malformed id → 404; none of them reach the model', async () => {
    seed();
    mockUser = null;
    expect((await post({ question: 'q?' })).status).toBe(401);
    mockUser = 'u2';
    expect((await post({ question: 'q?' })).status).toBe(404);
    mockUser = 'u1';
    expect((await post({ question: 'q?' }, 'nope')).status).toBe(404);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('a report that is not finished → 409 not_ready (no model call)', async () => {
    seed({ status: 'running', report_md: null });
    const r = await post({ question: 'q?' });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: 'not_ready' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('the rate limits answer 429 before anything is read or spent', async () => {
    seed();
    mockRate.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    expect((await post({ question: 'q?' })).status).toBe(429);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockDb.ops.filter((o) => o.table === 'research_jobs')).toEqual([]);
  });

  test('an exhausted platform budget → 503 with the localized notice, no model call', async () => {
    seed();
    mockBudget.mockResolvedValueOnce(false);
    const r = await post({ question: 'q?', locale: 'ka' });
    expect(r.status).toBe(503);
    const body = await r.json();
    expect(body.error).toBe('budget_exhausted');
    expect(body.message).toMatch(/[Ⴀ-ჿ]/);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('a model failure is a bare 503 — Google\'s text is not in the body', async () => {
    seed();
    mockGenerate.mockRejectedValueOnce(new Error('Gemini API error 429: Quota exceeded https://console.cloud.google.com/billing'));
    const r = await post({ question: 'q?' });
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toMatch(/gemini|quota|google|billing|console/i);
  });

  test('invalid bodies → 400', async () => {
    seed();
    expect((await post({})).status).toBe(400);
    expect((await post({ question: 'x'.repeat(1_001) })).status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
