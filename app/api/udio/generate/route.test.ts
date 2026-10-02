/** @jest-environment node */
/**
 * POST /api/udio/generate — reserved BEFORE the render; a free track is no longer possible.
 *
 * ⚠️ Before: the track rendered, then `deductCredits(...).catch(() => {})` ran and the track was returned whether the
 * charge landed or not — a parallel burst past one stale balance read, or a ledger error, was a free Udio track.
 * Every provider and the ledger are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/udio/client', () => ({ generateUdioTrack: jest.fn() }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { AI: {} } }));
jest.mock('../../../../lib/api/generationGuard', () => ({
  guardGeneration: jest.fn(async () => ({ ok: true, userId: 'user-1', locale: 'en' })),
  insufficientCreditsMessage: () => 'Insufficient Credits',
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundCredits: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateUdioTrack } from '../../../../lib/udio/client';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';

const ENV = { ...process.env };
const post = () => POST(new NextRequest('https://myavatar.ge/api/udio/generate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'calm piano' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, UDIO_API_KEY: 'k' };
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (generateUdioTrack as jest.Mock).mockResolvedValue({ audioUrl: 'https://udio.example/t.mp3', workId: 'w1' });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { process.env = ENV; });

test('the reservation lands BEFORE the render', async () => {
  const res = await POST(new NextRequest('https://myavatar.ge/api/udio/generate', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'calm piano' }),
  }));
  expect(res.status).toBe(200);
  expect((deductCredits as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((generateUdioTrack as jest.Mock).mock.invocationCallOrder[0]!);
  expect(refundCredits).not.toHaveBeenCalled();
});

test.each([
  ['insufficient', 402],
  ['error', 503],
])('a %s debit → %i and NO render (it used to render free)', async (reason, status) => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason });
  expect((await post()).status).toBe(status);
  expect(generateUdioTrack).not.toHaveBeenCalled();
});

test('no audio → refunded once, refunded:true, the provider not named', async () => {
  (generateUdioTrack as jest.Mock).mockResolvedValue({ audioUrl: null, workId: 'w1' });
  const j = await (await post()).json();
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect((refundCredits as jest.Mock).mock.calls[0]).toEqual(['user-1', 5, expect.stringMatching(/^udio:user-1:.*:refund$/)]);
  expect(j).toMatchObject({ success: false, refunded: true });
  expect(JSON.stringify(j)).not.toMatch(/udio/i);
});

test('a thrown render → refunded, and the raw provider text never reaches the body', async () => {
  (generateUdioTrack as jest.Mock).mockRejectedValue(new Error('Udio 402: {"detail":"out of credits, see https://udioapi.pro/billing"}'));
  const j = await (await post()).json();
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect(j.refunded).toBe(true);
  expect(JSON.stringify(j)).not.toMatch(/udioapi|billing/);
});
