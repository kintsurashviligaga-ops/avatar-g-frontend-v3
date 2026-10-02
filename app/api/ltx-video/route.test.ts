/** @jest-environment node */
/**
 * POST /api/ltx-video — reserved BEFORE the render; an LTX refusal or a throw gives it back.
 *
 * ⚠️ Before: LTX rendered, then `deductCredits(...).catch(() => {})` ran and the video streamed back whether the charge
 * landed or not — a free render on any failed deduct (parallel burst, ledger error). LTX is mocked — no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { EXPENSIVE: {} } }));
jest.mock('../../../lib/api/generationGuard', () => ({
  guardGeneration: jest.fn(async () => ({ ok: true, userId: 'user-1', locale: 'en' })),
  insufficientCreditsMessage: () => 'Insufficient Credits',
}));
jest.mock('../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundCredits: jest.fn(async () => ({ ok: true })) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { deductCredits, refundCredits } from '../../../lib/orchestrator/ledger';

const ENV = { ...process.env };
const realFetch = global.fetch;
let ltx: jest.Mock;
const post = () => POST(new NextRequest('https://myavatar.ge/api/ltx-video', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'a lighthouse at dusk' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, LTX_VIDEO_API_KEY: 'k' };
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  ltx = jest.fn(async () => new Response(new Uint8Array(16), { status: 200, headers: { 'content-type': 'video/mp4' } }));
  global.fetch = ltx as unknown as typeof fetch;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });
afterAll(() => { process.env = ENV; });

test('the reservation lands BEFORE the render, and a delivered video keeps it', async () => {
  const res = await post();
  expect(res.status).toBe(200);
  expect((deductCredits as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(ltx.mock.invocationCallOrder[0]!);
  expect(refundCredits).not.toHaveBeenCalled();
});

test.each([
  ['insufficient', 402],
  ['error', 503],
])('a %s debit → %i and NO render (it used to render free)', async (reason, status) => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason });
  expect((await post()).status).toBe(status);
  expect(ltx).not.toHaveBeenCalled();
});

test('an LTX refusal → refunded once, a code instead of LTX’s words, and never LTX’s own status', async () => {
  ltx.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Insufficient balance on account acct_42' } }), { status: 402 }));
  const res = await post();
  expect(res.status).toBe(503); // OUR outage — a provider 402 must not read as the user being out of credit
  const j = await res.json();
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect((refundCredits as jest.Mock).mock.calls[0]).toEqual(['user-1', 25, expect.stringMatching(/^ltx:user-1:.*:refund$/)]);
  expect(j).toEqual({ error: 'provider_unfunded', refunded: true });
});

test('a thrown fetch → refunded', async () => {
  ltx.mockRejectedValue(new Error('socket hang up'));
  const j = await (await post()).json();
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect(j.refunded).toBe(true);
});
