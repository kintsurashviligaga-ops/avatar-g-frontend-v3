/** @jest-environment node */
/**
 * POST /api/audio/georgian-song — signed in only, capped per account, diagnostics admin-only.
 *
 * ⚠️ It used to answer anyone: each accepted call is billed ElevenLabs TTS + Music work (up to three attempts), behind
 * nothing but a per-IP-per-minute limit. Pinned here: a guest is refused before the song builder runs, a signed-in
 * caller still gets a song, the per-account AUDIO_GEN_USER bucket is the one charged, and the raw-error diagnostic
 * answers only an admin. The builder is mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
}));
jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: null, budgetRemaining: null })),
}));
let mockCapped = false;
jest.mock('../../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: {
    EXPENSIVE: { maxRequests: 5, windowMs: 60_000, keyPrefix: 'rl:exp' },
    AUDIO_GEN_USER: { maxRequests: 60, windowMs: 86_400_000, keyPrefix: 'rl:audiogen:user' },
  },
  checkRateLimitByKey: jest.fn(async () => (mockCapped ? new Response('{"error":"Too many requests"}', { status: 429 }) : null)),
}));
let mockAdmin = false;
jest.mock('../../../../lib/auth/adminGuard', () => ({ isAdmin: jest.fn(async () => mockAdmin) }));
jest.mock('../../../../lib/audio/georgianSong', () => ({
  generateGeorgianSong: jest.fn(async () => 'https://x.supabase.co/storage/v1/object/sign/song.mp3'),
  diagnoseGeorgianSong: jest.fn(async () => ({ tts: 'ok' })),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateGeorgianSong, diagnoseGeorgianSong } from '../../../../lib/audio/georgianSong';
import { checkRateLimitByKey } from '../../../../lib/api/rate-limit';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/audio/georgian-song', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mockCapped = false;
  mockAdmin = false;
  delete process.env.FILM_ALLOW_ANONYMOUS;
});
afterEach(() => { process.env = { ...ENV }; });

test('a guest is refused (401 auth_required) and the paid song builder never runs', async () => {
  const res = await POST(post({ brief: 'ქართული სიმღერა თბილისზე', totalSec: 30 }));
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ error: 'auth_required', authRequired: true });
  expect(generateGeorgianSong).not.toHaveBeenCalled();
});

test('a signed-in caller gets the song, charged to the per-account AUDIO_GEN_USER bucket', async () => {
  mockUser = { id: 'user-1' };
  const res = await POST(post({ brief: 'ქართული სიმღერა თბილისზე', totalSec: 30 }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ url: 'https://x.supabase.co/storage/v1/object/sign/song.mp3' });
  expect(checkRateLimitByKey).toHaveBeenCalledWith('user-1', expect.objectContaining({ keyPrefix: 'rl:audiogen:user' }));
  expect(generateGeorgianSong).toHaveBeenCalledTimes(1);
});

test('a spent per-account allowance answers 429 before any provider work', async () => {
  mockUser = { id: 'user-1' };
  mockCapped = true;
  const res = await POST(post({ brief: 'song', totalSec: 30 }));
  expect(res.status).toBe(429);
  expect(generateGeorgianSong).not.toHaveBeenCalled();
});

test('the raw-error diagnostic answers only an admin', async () => {
  mockUser = { id: 'user-1' };
  const refused = await POST(post({ brief: 'song', diag: true }));
  expect(refused.status).toBe(403);
  expect(diagnoseGeorgianSong).not.toHaveBeenCalled();

  mockAdmin = true;
  const allowed = await POST(post({ brief: 'song', diag: true }));
  expect(allowed.status).toBe(200);
  expect(diagnoseGeorgianSong).toHaveBeenCalledTimes(1);
});
