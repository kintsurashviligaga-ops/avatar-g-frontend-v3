/** @jest-environment node */
/**
 * POST /api/ai/edit-audio — a signed-in caller can never get ANOTHER user's twin voiceprint back.
 *
 * The free `process` action takes a client media reference (a bare storage path, or a Supabase object URL),
 * signs it with the SERVICE ROLE, transcodes it and returns a 7-day URL — with no ownership check. A twin
 * voice sample sits at a path computable from the user id alone, so this route was the exploit: one POST
 * from any free account. Pinned here, against the REAL storage adapter (only the service client is faked,
 * and it signs ANY object as if it existed):
 *   · a bare `twins/<victim>/voice.webm` is only ever looked up in `uploads` — never where the sample lives;
 *   · a Supabase URL naming the twin bucket is handed back untouched — no token is minted for it;
 *   · an ordinary own upload still resolves (so the two refusals are the guard, not a broken fake).
 * Every provider and side effect is mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

const signed: Array<{ bucket: string; path: string }> = [];
jest.mock('../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => {
          signed.push({ bucket, path });
          return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=MINTED` }, error: null };
        },
      }),
    },
  }),
}));
jest.mock('../../../../lib/api/generationGuard', () => ({
  guardGeneration: jest.fn(async () => ({ ok: true, userId: 'attacker-0000-4000-8000-000000000000', locale: 'en' })),
  insufficientCreditsMessage: () => 'insufficient',
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { EXPENSIVE: {} } }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundCredits: jest.fn() }));
jest.mock('../../../../lib/replicate/client', () => ({ createPrediction: jest.fn(), pollUntilDone: jest.fn() }));
jest.mock('../../../../lib/audio/audioOps', () => ({ audioProcess: jest.fn(async () => 'https://proj.supabase.co/out.mp3?token=OUT') }));
jest.mock('../../../../lib/orchestrator/saveEditorOutput', () => ({ saveEditorOutput: jest.fn(async () => undefined) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { audioProcess } from '../../../../lib/audio/audioOps';
import { TWIN_PRIVATE_BUCKET, twinVoicePath } from '../../../../lib/avatar/enroll';

const VICTIM = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const VOICE = twinVoicePath(VICTIM, 'webm');
const post = (mediaUrl: string) =>
  POST(new NextRequest('https://myavatar.ge/api/ai/edit-audio', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'process', mediaUrl }),
  }));
/** Did the service role sign the object where enrollment actually stores the victim's voice? */
const signedTheVoiceprint = () => signed.some((s) => s.bucket === TWIN_PRIVATE_BUCKET && s.path === VOICE);
const processedSrc = () => (audioProcess as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  signed.length = 0;
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('sanity: the caller\'s own bare upload path is signed and processed', async () => {
  const res = await post('audio-studio/1-abc.mp3');
  expect(res.status).toBe(200);
  expect(signed).toEqual([{ bucket: 'uploads', path: 'audio-studio/1-abc.mp3' }]);
  expect(processedSrc()[0]).toMatch(/token=MINTED/);
});

test('a bare twin path never reaches the twin bucket', async () => {
  await post(VOICE);
  expect(signedTheVoiceprint()).toBe(false);
  expect(signed.every((s) => s.bucket !== TWIN_PRIVATE_BUCKET)).toBe(true);
});

test('a Supabase URL naming the twin bucket gets no token minted — the forged input comes back untouched', async () => {
  for (const kind of ['sign', 'public'] as const) {
    const url = `https://zwksnayk.supabase.co/storage/v1/object/${kind}/${TWIN_PRIVATE_BUCKET}/${VOICE}${kind === 'sign' ? '?token=forged' : ''}`;
    await post(url);
  }
  expect(signed).toEqual([]);
  expect(processedSrc().some((s) => s.includes('MINTED'))).toBe(false);
});
