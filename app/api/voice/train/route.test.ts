/** @jest-environment node */
/**
 * /api/voice/train — a personal RVC voice model (training on Replicate).
 *
 * ⚠️ RVC has no Google engine, so every new training is refused with 503 google_only BEFORE the session, the rate limit,
 * the body, the dataset or Replicate, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). The guards that used to stand in
 * front of it (a guest, FILM_ALLOW_ANONYMOUS=1, an unverifiable session, an internal host, another account's upload) all
 * end on that same refusal now. GET stays open: it settles a training started before the change, and keeps the free
 * demo-status fallback for a guest. RVC, the voice-model store and storage are mocked — no network, no spend.
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
import { prepareDatasetZip, startRvcTraining, rvcNameFor, pollRvcPrediction, rehostModel } from '../../../../lib/audio/rvc';
import { saveTrainingJob, getLatestTraining, markTrainingDone } from '../../../../lib/audio/voiceModel';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
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

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  lookupThrows = false;
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

function expectNothingStarted() {
  expect(authedClientFromRequest).not.toHaveBeenCalled();
  expect(rateMock).not.toHaveBeenCalled();
  expect(nameMock).not.toHaveBeenCalled();
  expect(datasetMock).not.toHaveBeenCalled();
  expect(trainMock).not.toHaveBeenCalled();
  expect(saveMock).not.toHaveBeenCalled();
  expect(uploadMock).not.toHaveBeenCalled();
  expect(signMock).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
}

async function expectRefused(res: Response) {
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ success: false, url: null, jobId: null, code: 'google_only', error: 'google_only' });
  expectNothingStarted();
}

describe.each([
  {},
  { MEDIA_GOOGLE_ONLY: '0' },
  { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-replicate' },
])('env %p — a new training is refused before anything runs', (env) => {
  beforeEach(() => { Object.assign(process.env, env); });

  test('a signed-in caller with a valid recording', async () => {
    mockUser = { id: USER_ID };
    await expectRefused(await POST(post({ voiceReference: VOICE })));
  });

  test('a guest, even with FILM_ALLOW_ANONYMOUS=1 (no shared demo voice is trained)', async () => {
    process.env.FILM_ALLOW_ANONYMOUS = '1';
    await expectRefused(await POST(post({ voiceReference: VOICE })));
  });

  test('a session lookup that would throw', async () => {
    lookupThrows = true;
    await expectRefused(await POST(post({ voiceReference: VOICE })));
  });

  test.each([
    'http://169.254.169.254/latest/meta-data/',
    'omni-uploads/someone-else/voice.mp3',
  ])('a recording the old guards refused (%s) — nothing is fetched or signed', async (voiceReference) => {
    mockUser = { id: USER_ID };
    await expectRefused(await POST(post({ voiceReference })));
  });
});

test('the refusal speaks the caller\'s language', async () => {
  const res = await POST(post({ voiceReference: VOICE }, { cookie: 'NEXT_LOCALE=en' }));
  expect(res.status).toBe(503);
  expect((await res.json()).message).toMatch(/^This tool is paused/);
});

test('GET keeps the demo fallback for a guest (a free status poll)', async () => {
  const res = await GET(new NextRequest('https://myavatar.ge/api/voice/train'));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'none' });
  expect(latestMock).toHaveBeenCalledWith('demo-voice-user');
  expect(trainMock).not.toHaveBeenCalled();
});

test('GET settles a training started before the change: a finished model is copied to permanent storage', async () => {
  mockUser = { id: USER_ID };
  latestMock.mockResolvedValueOnce({ id: 'pred-old', status: 'processing', name: 'rvc_11111111' } as never);
  (pollRvcPrediction as jest.Mock).mockResolvedValueOnce({ status: 'succeeded', modelUrl: 'https://replicate.delivery/m.zip' });
  (rehostModel as jest.Mock).mockResolvedValueOnce('https://x.supabase.co/models/m.zip');
  const res = await GET(new NextRequest('https://myavatar.ge/api/voice/train'));
  expect(await res.json()).toEqual({ status: 'completed', name: 'rvc_11111111' });
  expect(latestMock).toHaveBeenCalledWith(USER_ID);
  expect(markTrainingDone).toHaveBeenCalledWith('pred-old', 'https://x.supabase.co/models/m.zip');
  expect(trainMock).not.toHaveBeenCalled();
});
