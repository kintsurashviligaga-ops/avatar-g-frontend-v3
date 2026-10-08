/** @jest-environment node */
/**
 * /api/voice/train — POST is signed-in only, and the session lookup fails CLOSED.
 *
 * ⚠️ A guest used to fall back to DEMO_VOICE_USER_ID, so an anonymous POST started a paid Replicate RVC training on
 * the platform's key (and overwrote the shared demo voice). Pinned here: a guest — even with FILM_ALLOW_ANONYMOUS=1 —
 * or an unverifiable session is refused before the body is read, the dataset is built or Replicate is touched; a
 * signed-in caller trains under THEIR OWN id; GET keeps the free demo-status fallback.
 * RVC, the voice-model store and storage are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
let lookupThrows = false;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => {
    if (lookupThrows) throw new Error('auth backend unreachable');
    return { supabase: {}, user: mockUser };
  }),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000, keyPrefix: 'rl:exp' } },
}));
jest.mock('../../../../lib/audio/rvc', () => ({
  prepareDatasetZip: jest.fn(async () => 'https://x.supabase.co/dataset.zip'),
  startRvcTraining: jest.fn(async () => 'pred-123'),
  pollRvcPrediction: jest.fn(async () => ({ status: 'processing' })),
  rehostModel: jest.fn(async (u: string) => u),
  rvcNameFor: jest.fn((uid: string) => `rvc_${uid.slice(0, 8)}`),
}));
jest.mock('../../../../lib/audio/voiceModel', () => ({
  DEMO_VOICE_USER_ID: 'demo-voice-user',
  saveTrainingJob: jest.fn(async () => true),
  getLatestTraining: jest.fn(async () => null),
  markTrainingDone: jest.fn(async () => true),
  markTrainingFailed: jest.fn(async () => true),
}));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  uploadAndSign: jest.fn(async () => 'https://x.supabase.co/signed.mp3'),
  createSignedAssetUrl: jest.fn(async () => 'https://x.supabase.co/signed-asset.mp3'),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { checkRateLimit } from '../../../../lib/api/rate-limit';
import { prepareDatasetZip, startRvcTraining, rvcNameFor } from '../../../../lib/audio/rvc';
import { saveTrainingJob, getLatestTraining } from '../../../../lib/audio/voiceModel';
import { createSignedAssetUrl, uploadAndSign } from '../../../../lib/orchestrator/storage-adapter';

const rateMock = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;
const datasetMock = prepareDatasetZip as jest.MockedFunction<typeof prepareDatasetZip>;
const trainMock = startRvcTraining as jest.MockedFunction<typeof startRvcTraining>;
const nameMock = rvcNameFor as jest.MockedFunction<typeof rvcNameFor>;
const saveMock = saveTrainingJob as jest.MockedFunction<typeof saveTrainingJob>;
const latestMock = getLatestTraining as jest.MockedFunction<typeof getLatestTraining>;
const signMock = createSignedAssetUrl as jest.MockedFunction<typeof createSignedAssetUrl>;
const uploadMock = uploadAndSign as jest.MockedFunction<typeof uploadAndSign>;

const USER_ID = '11111111-2222-4333-8444-555555555555';
const VOICE = 'https://cdn.example.com/my-voice.mp3';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('https://myavatar.ge/api/voice/train', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  lookupThrows = false;
  delete process.env.FILM_ALLOW_ANONYMOUS;
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  delete process.env.FILM_ALLOW_ANONYMOUS;
});

function expectNothingStarted() {
  expect(datasetMock).not.toHaveBeenCalled();
  expect(trainMock).not.toHaveBeenCalled();
  expect(saveMock).not.toHaveBeenCalled();
  expect(uploadMock).not.toHaveBeenCalled();
  expect(signMock).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
}

test('a guest is refused (401 auth_required) and Replicate is never called', async () => {
  const res = await POST(post({ voiceReference: VOICE }));
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ success: false, error: 'auth_required', authRequired: true });
  expectNothingStarted();
});

test('the refusal speaks the caller\'s language (Accept-Language)', async () => {
  const res = await POST(post({ voiceReference: VOICE }, { 'accept-language': 'en-US,en;q=0.9' }));
  expect(res.status).toBe(401);
  expect((await res.json()).message).toMatch(/^Sign in/);
});

test('FILM_ALLOW_ANONYMOUS=1 does NOT re-open training — no shared demo voice is trained', async () => {
  process.env.FILM_ALLOW_ANONYMOUS = '1';
  const res = await POST(post({ voiceReference: VOICE }));
  expect(res.status).toBe(401);
  expectNothingStarted();
  expect(nameMock).not.toHaveBeenCalledWith('demo-voice-user');
});

test('a session lookup that throws is refused (401), not trained under the demo identity', async () => {
  lookupThrows = true;
  const res = await POST(post({ voiceReference: VOICE }));
  expect(res.status).toBe(401);
  expectNothingStarted();
});

test('the IP rate limit still runs first', async () => {
  rateMock.mockResolvedValueOnce(new Response('{}', { status: 429 }) as never);
  mockUser = { id: USER_ID };
  const res = await POST(post({ voiceReference: VOICE }));
  expect(res.status).toBe(429);
  expectNothingStarted();
});

test('a signed-in caller trains under their own id, never the demo one', async () => {
  mockUser = { id: USER_ID };
  const res = await POST(post({ voiceReference: VOICE }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ success: true, jobId: 'pred-123', status: 'processing' });
  expect(nameMock).toHaveBeenCalledWith(USER_ID);
  expect(datasetMock).toHaveBeenCalledWith(VOICE, `rvc_${USER_ID.slice(0, 8)}`);
  expect(trainMock).toHaveBeenCalledTimes(1);
  expect(saveMock).toHaveBeenCalledWith(USER_ID, 'pred-123', `rvc_${USER_ID.slice(0, 8)}`);
});

test.each([
  'http://127.0.0.1/voice.mp3',
  'http://169.254.169.254/latest/meta-data/',
  'http://localhost:3000/voice.mp3',
  'http://10.0.0.7/voice.mp3',
])('a signed-in caller cannot point the server fetch at an internal host (%s)', async (url) => {
  mockUser = { id: USER_ID };
  const res = await POST(post({ voiceReference: url }));
  expect(res.status).toBe(400);
  expectNothingStarted();
});

test('a bare storage path must be the caller’s own upload: another account’s recording is refused, never signed', async () => {
  mockUser = { id: USER_ID };
  for (const p of ['omni-uploads/someone-else/voice.mp3', 'someone-else/voice.mp3', 'audio-studio/1-a.mp3']) {
    const res = await POST(post({ voiceReference: p }));
    expect(res.status).toBe(403);
  }
  expect(createSignedAssetUrl).not.toHaveBeenCalled();
  expectNothingStarted();
  await POST(post({ voiceReference: `omni-uploads/${USER_ID}/voice.mp3` }));
  expect(createSignedAssetUrl).toHaveBeenCalledWith('uploads', `omni-uploads/${USER_ID}/voice.mp3`, 3600);
});

test('GET keeps the demo fallback for a guest (a free status poll)', async () => {
  const res = await GET(new NextRequest('https://myavatar.ge/api/voice/train'));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'none' });
  expect(latestMock).toHaveBeenCalledWith('demo-voice-user');
  expect(trainMock).not.toHaveBeenCalled();
});
