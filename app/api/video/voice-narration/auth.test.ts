/** @jest-environment node */
/**
 * POST /api/video/voice-narration — a film's narration converted into the user's trained voice (RVC on Replicate).
 *
 * ⚠️ RVC has no Google engine, so after the rate limit every request is refused with 503 google_only before the session,
 * the voice model, storage or Replicate, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). The film stitch reads an
 * answer without a `url` as "keep the original narration", so a film never breaks on it. The sign-in rules it used to pin
 * went with the code. RVC, the voice-model store and storage are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn() }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { WRITE: { maxRequests: 20, windowMs: 60_000 } },
}));
jest.mock('../../../../lib/audio/rvc', () => ({ convertSongWithRvc: jest.fn() }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ DEMO_VOICE_USER_ID: 'demo-voice-user', getUserVoiceModel: jest.fn() }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { checkRateLimit } from '../../../../lib/api/rate-limit';
import { convertSongWithRvc } from '../../../../lib/audio/rvc';
import { getUserVoiceModel } from '../../../../lib/audio/voiceModel';
import { uploadAndSign } from '../../../../lib/orchestrator/storage-adapter';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/video/voice-narration', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const BODY = { voiceoverUrl: 'https://x.supabase.co/narration.mp3' };
const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(4096), { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test.each([
  {},
  { MEDIA_GOOGLE_ONLY: '0' },
  { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-replicate' },
  { FILM_ALLOW_ANONYMOUS: '1' },
])('env %p: refused google_only with no url, before the session, the voice model or RVC', async (env) => {
  Object.assign(process.env, env);
  const res = await POST(post(BODY));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ success: false, url: null, code: 'google_only' });
  expect(authedClientFromRequest).not.toHaveBeenCalled();
  expect(getUserVoiceModel).not.toHaveBeenCalled();
  expect(convertSongWithRvc).not.toHaveBeenCalled();
  expect(uploadAndSign).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('the rate limit still answers first', async () => {
  (checkRateLimit as jest.Mock).mockResolvedValueOnce(new Response('{}', { status: 429 }));
  expect((await POST(post(BODY))).status).toBe(429);
  expect(convertSongWithRvc).not.toHaveBeenCalled();
});
