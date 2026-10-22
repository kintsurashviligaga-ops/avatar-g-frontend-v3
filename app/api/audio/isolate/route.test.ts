/** @jest-environment node */
/**
 * POST /api/audio/isolate — refused (MASTER TASK v3.1 PR 5e). It ran the ElevenLabs Voice Isolator for the HeyGen singer
 * pass; neither has a Google engine. Every request answers 503 google_only before the session, the limit or any fetch.
 * The isolator module itself is gone (PR 5f), so the network spy is what would catch a call to it — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/auth', () => ({ requireAuthenticatedUser: jest.fn(async () => ({ id: 'user-1' })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  checkRateLimitByKey: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 }, AUDIO_GEN_USER: { maxRequests: 60, windowMs: 86_400_000 } },
}));

import { NextRequest } from 'next/server';
import { requireAuthenticatedUser } from '../../../../lib/supabase/auth';
import { checkRateLimit, checkRateLimitByKey } from '../../../../lib/api/rate-limit';
import { POST } from './route';

const OURS = 'https://x.supabase.co/storage/v1/object/sign/music/song.mp3?token=t';
const post = (body: unknown, locale?: string) =>
  POST(new NextRequest('https://myavatar.ge/api/audio/isolate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(locale ? { cookie: `NEXT_LOCALE=${locale}` } : {}) },
    body: JSON.stringify(body),
  }));

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => fetchSpy.mockRestore());

test.each([
  ['own audio', { audioUrl: OURS }],
  ['no audio', {}],
])('%s → 503 google_only, and nothing runs', async (_name, body) => {
  const res = await post(body);
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ success: false, url: null, jobId: null, code: 'google_only', error: 'google_only' });
  expect(requireAuthenticatedUser).not.toHaveBeenCalled();
  expect(checkRateLimit).not.toHaveBeenCalled();
  expect(checkRateLimitByKey).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('the refusal speaks the caller\'s language', async () => {
  expect((await (await post({ audioUrl: OURS }, 'en')).json()).message).toMatch(/^This tool is paused/);
  expect((await (await post({ audioUrl: OURS }, 'ru')).json()).message).toMatch(/^Этот инструмент/);
});
