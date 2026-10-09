/** @jest-environment node */
/**
 * POST /api/ai — Gemini only, the credits taken BEFORE the call and given back on a miss.
 *
 * Before (main up to 2026-10-09): the route called Anthropic's claude-sonnet-4-6 (a provider outside the Google +
 * ElevenLabs boundary), charged only AFTER the answer and swallowed a failed charge, so a signed-in user with no
 * credits still got the paid answer, and a demo `newBalance = 1000` came back. Pinned here: no charge → no model call;
 * a Gemini miss refunds exactly what was charged; the route source names no Anthropic endpoint or key.
 */
jest.mock('server-only', () => ({}));
// compose() imports the session guard, which loads the env schema; this route never uses either.
jest.mock('../../../lib/security/apiGuard', () => ({ getAuthContext: jest.fn(async () => null) }));
jest.mock('../../../lib/security/csrf', () => ({ verifyCsrfToken: jest.fn(), requiresCsrf: jest.fn(() => false) }));
let mockSignedIn = true;
jest.mock('../../../lib/supabase/auth', () => ({
  requireAuthenticatedUser: jest.fn(async () => {
    if (!mockSignedIn) throw new Error('unauthorized');
    return { id: 'user-1', email: 'u@example.com' };
  }),
}));
jest.mock('../../../lib/orchestrator/ledger', () => ({
  deductCredits: jest.fn(),
  refundCredits: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../lib/ai/llmText', () => ({ llmText: jest.fn() }));
jest.mock('../../../lib/ai/google/transport', () => ({ googleAiConfigured: jest.fn(() => true) }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { deductCredits, refundCredits } from '../../../lib/orchestrator/ledger';
import { llmText } from '../../../lib/ai/llmText';

const deduct = deductCredits as jest.Mock;
const refund = refundCredits as jest.Mock;
const gemini = llmText as jest.Mock;

const ENV = { ...process.env };
let ip = 0;
const post = (body: unknown = { agent: 'copy', prompt: 'write a tagline' }) =>
  POST(new NextRequest('https://myavatar.ge/api/ai', {
    method: 'POST',
    // a fresh address per request keeps the per-IP limiter out of the way
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${++ip}` },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  process.env = { ...ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co' };
  mockSignedIn = true;
  deduct.mockReset();
  refund.mockClear();
  gemini.mockReset();
});
afterAll(() => { process.env = ENV; });

test('signed out → 401, nothing charged, no model call', async () => {
  mockSignedIn = false;
  expect((await post()).status).toBe(401);
  expect(deduct).not.toHaveBeenCalled();
  expect(gemini).not.toHaveBeenCalled();
});

test('too few credits → 402 and Gemini is never asked', async () => {
  deduct.mockResolvedValue({ ok: false, reason: 'insufficient' });
  const res = await post();
  expect(res.status).toBe(402);
  expect(gemini).not.toHaveBeenCalled();
});

test.each(['skipped', 'error'])('a ledger that cannot charge (%s) → 503, never a free answer', async (reason) => {
  deduct.mockResolvedValue({ ok: false, reason });
  expect((await post()).status).toBe(503);
  expect(gemini).not.toHaveBeenCalled();
});

test('charged first, then Gemini answers: 200 with the real balance and no refund', async () => {
  const order: string[] = [];
  deduct.mockImplementation(async () => { order.push('charge'); return { ok: true, balance: 37 }; });
  gemini.mockImplementation(async () => { order.push('gemini'); return 'Fresh tagline'; });
  const res = await post();
  expect(res.status).toBe(200);
  expect(order).toEqual(['charge', 'gemini']);
  const json = await res.json();
  expect(json).toMatchObject({ result: 'Fresh tagline', agent: 'copy', creditsUsed: 3, newBalance: 37, model: 'gemini' });
  expect(deduct).toHaveBeenCalledWith('user-1', 3, expect.stringMatching(/^ai-copy-user-1-/));
  expect(refund).not.toHaveBeenCalled();
});

test('Gemini misses → 502 and exactly the charge is given back under the charge\'s ref', async () => {
  deduct.mockResolvedValue({ ok: true, balance: 37 });
  gemini.mockResolvedValue(null);
  const res = await post({ agent: 'video', prompt: 'a storyboard' });
  expect(res.status).toBe(502);
  const ref = deduct.mock.calls[0][2] as string;
  expect(refund).toHaveBeenCalledTimes(1);
  expect(refund).toHaveBeenCalledWith('user-1', 15, `${ref}:refund`);
});

test('the route names no Anthropic endpoint, model or key', () => {
  const src = readFileSync(join(__dirname, 'route.ts'), 'utf8');
  expect(src).not.toMatch(/api\.anthropic\.com|ANTHROPIC_API_KEY|claude-/i);
  expect(src).not.toMatch(/newBalance\s*=\s*1000/);
});
