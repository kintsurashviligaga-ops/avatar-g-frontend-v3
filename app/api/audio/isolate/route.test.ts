/** @jest-environment node */
/**
 * POST /api/audio/isolate — the ElevenLabs Voice Isolator for the singer lip-sync. Signed-in only, own-storage audio
 * only (SSRF), and, since it bills no credits (gap C3), one per-account daily ceiling shared with the other paid audio
 * helpers. Any miss answers { vocalUrl: null } so the caller falls back to the full mix; the ceiling answers 429.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('../../../../lib/supabase/auth', () => ({
  requireAuthenticatedUser: jest.fn(async () => { if (!mockUser) throw new Error('UNAUTHENTICATED'); return mockUser; }),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 }, AUDIO_GEN_USER: { maxRequests: 60, windowMs: 86_400_000 } },
}));
jest.mock('../../../../lib/elevenlabs/audioIsolation', () => ({ isolateVocal: jest.fn(async () => 'https://x.supabase.co/vocal.mp3') }));

import { NextRequest } from 'next/server';
import { checkRateLimitByKey, RATE_LIMITS } from '../../../../lib/api/rate-limit';
import { isolateVocal } from '../../../../lib/elevenlabs/audioIsolation';
import { POST } from './route';

const OURS = 'https://x.supabase.co/storage/v1/object/sign/music/song.mp3?token=t';
const ENV = { ...process.env };
const post = (body: unknown) =>
  POST(new NextRequest('https://myavatar.ge/api/audio/isolate', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));

beforeAll(() => { process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'; });
afterAll(() => { process.env = ENV; });
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'user-1' };
});

test('signed out: 401, nothing spent, nothing isolated', async () => {
  mockUser = null;
  expect((await post({ audioUrl: OURS })).status).toBe(401);
  expect(checkRateLimitByKey).not.toHaveBeenCalled();
  expect(isolateVocal).not.toHaveBeenCalled();
});

test('own audio is counted against the session user before the isolator runs', async () => {
  const res = await post({ audioUrl: OURS });
  expect(await res.json()).toEqual({ vocalUrl: 'https://x.supabase.co/vocal.mp3' });
  expect(checkRateLimitByKey).toHaveBeenCalledWith('user-1', RATE_LIMITS.AUDIO_GEN_USER);
  expect((checkRateLimitByKey as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((isolateVocal as jest.Mock).mock.invocationCallOrder[0]);
});

test('over the daily ceiling the limiter answers and the isolator is not called', async () => {
  (checkRateLimitByKey as jest.Mock).mockResolvedValueOnce(new Response('{"error":"rate_limited"}', { status: 429 }));
  expect((await post({ audioUrl: OURS })).status).toBe(429);
  expect(isolateVocal).not.toHaveBeenCalled();
});

test('audio we do not host is never fetched and spends none of the allowance', async () => {
  const res = await post({ audioUrl: 'http://169.254.169.254/latest/meta-data/' });
  expect(await res.json()).toEqual({ vocalUrl: null });
  expect(checkRateLimitByKey).not.toHaveBeenCalled();
  expect(isolateVocal).not.toHaveBeenCalled();
});
