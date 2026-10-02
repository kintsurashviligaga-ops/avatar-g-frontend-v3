/** @jest-environment node */
/**
 * POST /api/ai/music — the session lookup fails CLOSED.
 *
 * ⚠️ The auth lookup used to run inside the reserve block's fail-open `try` ("a ledger/Redis blip never blocks a paid
 * render"), so a THROW from authedClientFromRequest skipped the sign-in gate together with the charge and the track
 * rendered for nobody, uncharged. Pinned here:
 *   · a guest → 401, no provider, no ledger, no mutex;
 *   · a lookup that throws → 503 (our outage, retryable), no provider, no ledger;
 *   · a signed-in caller passes the gate and is reserved against THEIR account before the render.
 * Every provider, the ledger and the idempotency store are mocked — no network, no spend.
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
jest.mock('../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn(async () => ({ response: null, auth: null, budgetRemaining: null })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/elevenlabs/music', () => ({ composeElevenLabsMusic: jest.fn(), hasElevenLabsMusicKey: jest.fn(() => true) }));
jest.mock('../../../../lib/ai/replicate', () => ({ generateMusicCover: jest.fn(), generateVoiceSong: jest.fn(), generateMusic: jest.fn() }));
jest.mock('../../../../lib/udio/client', () => ({ generateUdioTrack: jest.fn() }));
jest.mock('../../../../lib/ai/lyriaMusic', () => ({ hasLyriaProvider: jest.fn(() => true), generateLyriaTrack: jest.fn() }));
jest.mock('../../../../lib/chat/mediaKeys', () => ({ hasUdioApiKey: jest.fn(() => true) }));
jest.mock('../../../../lib/audio/trimAudio', () => ({ trimAudioToDuration: jest.fn() }));
jest.mock('../../../../lib/audio/transcode', () => ({ transcodeVoiceToMp3: jest.fn() }));
jest.mock('../../../../lib/audio/rvc', () => ({ convertSongWithRvc: jest.fn() }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ getUserVoiceModel: jest.fn(async () => null), DEMO_VOICE_USER_ID: 'demo' }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(), createSignedAssetUrl: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));
jest.mock('../../../../lib/providers/latencyFailover', () => ({ runWithLatencyFailover: jest.fn() }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  isProviderTripped: jest.fn(() => false),
  recordProviderResult: jest.fn(),
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
  hashPayload: jest.fn(async () => 'hash'),
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  debitExistsForRef: jest.fn(async () => false),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundCredits: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../lib/credits/musicSettlement', () => ({ settleMusicCharge: jest.fn() }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({
  // The render's first awaited step. Failing it here ends the render right after the gate + reserve, which is all
  // the signed-in case needs to prove — and it must then refund.
  promptToEnglish: jest.fn(async () => { throw new Error('render stopped by the test'); }),
  lastTranslateOutcome: jest.fn(() => 'ok'),
}));
jest.mock('../../../../lib/audio/trackDuration', () => ({ probeTrackDurationSec: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateLyriaTrack } from '../../../../lib/ai/lyriaMusic';
import { generateUdioTrack } from '../../../../lib/udio/client';
import { composeElevenLabsMusic } from '../../../../lib/elevenlabs/music';
import { generateMusic } from '../../../../lib/ai/replicate';
import { promptToEnglish } from '../../../../lib/ai/promptToEnglish';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
import { claimIdempotencyKey } from '../../../../lib/orchestrator/idempotency';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/ai/music', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const BODY = { prompt: 'მშვიდი ფორტეპიანო წვიმიან საღამოს', style: 'ambient', durationSec: 30 };
let fetchSpy: jest.SpyInstance;

function expectNothingSpent(): void {
  for (const provider of [generateLyriaTrack, generateUdioTrack, composeElevenLabsMusic, generateMusic, promptToEnglish]) {
    expect(provider).not.toHaveBeenCalled();
  }
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(deductCredits).not.toHaveBeenCalled();
  expect(claimIdempotencyKey).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  lookupThrows = false;
  // Cover art goes to Pollinations through fetch; any fetch at all means the render started.
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

test('a guest is refused (401 auth_required) before any provider, ledger or mutex is touched', async () => {
  const res = await POST(post(BODY));
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ code: 'auth_required' });
  expectNothingSpent();
});

test('a session lookup that THROWS refuses (503) instead of rendering uncharged', async () => {
  lookupThrows = true;
  const res = await POST(post(BODY));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ success: false, error: 'auth_unavailable' });
  expectNothingSpent();
});

test('a signed-in caller passes the gate and is reserved against their own account before the render', async () => {
  mockUser = { id: 'user-1' };
  const res = await POST(post(BODY));
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect((deductCredits as jest.Mock).mock.calls[0][0]).toBe('user-1');
  expect(promptToEnglish).toHaveBeenCalled(); // the render began — the gate let them through
  // The test stops the render at its first step; the reserve must come back.
  expect(res.status).toBe(502);
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect((refundCredits as jest.Mock).mock.calls[0][0]).toBe('user-1');
});
