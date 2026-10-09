/** @jest-environment node */
/**
 * POST /api/orbit/agent — no forbidden-vendor answer while AI_GOOGLE_ONLY is on.
 *
 * Before (2026-10-09): the route streamed chatEngine (OpenRouter / OpenAI) to any signed-in user whatever
 * AI_GOOGLE_ONLY said, with no credit charged, though no screen calls it. Now it is 404 under Google-only (the
 * default) and only the AI_GOOGLE_ONLY=0 kill switch brings the old stream back.
 */
jest.mock('server-only', () => ({}));
type DoneCb = { onDone: (r: Record<string, unknown>) => void };
const mockExecuteStream = jest.fn(async (_req: unknown, cb: DoneCb) => {
  cb.onDone({ model: 'test', tokensIn: 1, tokensOut: 1, costEstimate: 0 });
});
jest.mock('../../../../lib/ai/chatEngine', () => ({ executeStream: (req: unknown, cb: DoneCb) => mockExecuteStream(req, cb) }));
jest.mock('../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn(async () => ({ auth: { userId: 'user-1' } })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null), RATE_LIMITS: { AI: {}, CHAT_USER: {} } }));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: null })) }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const ENV = { ...process.env };
const post = () =>
  POST(new NextRequest('https://myavatar.ge/api/orbit/agent', { method: 'POST', body: JSON.stringify({ message: 'hi' }) }));

beforeEach(() => {
  process.env = { ...ENV };
  delete process.env.AI_GOOGLE_ONLY;
  mockExecuteStream.mockClear();
});
afterAll(() => { process.env = ENV; });

test('Google-only (the default): 404 and no chatEngine call, even for a signed-in user', async () => {
  const res = await post();
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'Not found' });
  expect(mockExecuteStream).not.toHaveBeenCalled();
});

test('AI_GOOGLE_ONLY=0 (kill switch): the old stream runs', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  const res = await post();
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('"done":true');
  expect(mockExecuteStream).toHaveBeenCalledTimes(1);
});
