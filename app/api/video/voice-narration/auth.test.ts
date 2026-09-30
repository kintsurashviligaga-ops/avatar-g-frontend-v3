/** @jest-environment node */
/**
 * POST /api/video/voice-narration — signed in only, and the session lookup fails CLOSED.
 *
 * ⚠️ A guest used to fall through to DEMO_VOICE_USER_ID's trained voice, so an anonymous POST ran a Replicate RVC
 * conversion on any audio URL it named. Pinned here: a guest (or an unverifiable session) is refused before the voice
 * model is even looked up, and a signed-in caller converts with THEIR OWN model, never the demo voice.
 * RVC, the voice-model store and storage are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
let lookupThrows = false;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => {
    if (lookupThrows) throw new Error('auth backend unreachable');
    return { user: mockUser };
  }),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { WRITE: { maxRequests: 20, windowMs: 60_000 } },
}));
jest.mock('../../../../lib/audio/rvc', () => ({ convertSongWithRvc: jest.fn(async () => 'https://replicate.delivery/out.mp3') }));
jest.mock('../../../../lib/audio/voiceModel', () => ({
  DEMO_VOICE_USER_ID: 'demo-voice-user',
  getUserVoiceModel: jest.fn(async (uid: string) => ({ modelUrl: `https://models.example/${uid}.zip` })),
}));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://x.supabase.co/signed.mp3') }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { convertSongWithRvc } from '../../../../lib/audio/rvc';
import { getUserVoiceModel } from '../../../../lib/audio/voiceModel';

const rvcMock = convertSongWithRvc as jest.MockedFunction<typeof convertSongWithRvc>;
const modelMock = getUserVoiceModel as jest.MockedFunction<typeof getUserVoiceModel>;

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/video/voice-narration', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const BODY = { voiceoverUrl: 'https://x.supabase.co/narration.mp3' };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  lookupThrows = false;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(4096), { status: 200 }));
});

afterEach(() => fetchSpy.mockRestore());

test('a guest is refused (401) before any voice model is looked up or any RVC job starts', async () => {
  const res = await POST(post(BODY));
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ error: 'auth_required', authRequired: true });
  expect(modelMock).not.toHaveBeenCalled();
  expect(rvcMock).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a session lookup that throws is refused (401), not converted with the demo voice', async () => {
  lookupThrows = true;
  const res = await POST(post(BODY));
  expect(res.status).toBe(401);
  expect(modelMock).not.toHaveBeenCalled();
  expect(rvcMock).not.toHaveBeenCalled();
});

test('a signed-in caller passes the gate and converts with their own model', async () => {
  mockUser = { id: 'user-1' };
  const res = await POST(post(BODY));
  expect(res.status).toBe(200);
  expect(modelMock).toHaveBeenCalledWith('user-1');
  expect(rvcMock).toHaveBeenCalledWith(BODY.voiceoverUrl, 'https://models.example/user-1.zip');
  expect(await res.json()).toMatchObject({ success: true, url: 'https://x.supabase.co/signed.mp3' });
});
