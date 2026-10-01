/** @jest-environment node */
/**
 * POST /api/ai/music, fed the studio's RE-ROLL body (lib/studio/musicRegen).
 *
 * ⚠️ The re-roll used to send no durationSec / tempo / voiceType, so the route billed and rendered its 30 s
 * default and composed without the singer's gender. Pinned against the REAL route: the re-roll body's fields
 * are the ones the route reads (they reach the mutex signature), the reserve is the tier the user picked, and
 * the toast seconds (musicRegenBilledSeconds) price exactly what the ledger was debited.
 * Every provider, the ledger and the idempotency store are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })),
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
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundCredits: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../lib/credits/musicSettlement', () => ({ settleMusicCharge: jest.fn() }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({
  // The render's first awaited step. Failing it stops the render right after the reserve — all this needs.
  promptToEnglish: jest.fn(async () => { throw new Error('render stopped by the test'); }),
  lastTranslateOutcome: jest.fn(() => 'ok'),
}));
jest.mock('../../../../lib/audio/trackDuration', () => ({ probeTrackDurationSec: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { deductCredits } from '../../../../lib/orchestrator/ledger';
import { hashPayload } from '../../../../lib/orchestrator/idempotency';
import { creditCostFor } from '../../../../lib/credits/pricing';
import { makeMusicRegenSpec, musicRegenBilledSeconds, musicRegenBody, type MusicRegenSpec } from '../../../../lib/studio/musicRegen';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/ai/music', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  // Cover art goes to Pollinations through fetch — answer it locally so nothing leaves the process.
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

/** The request signature the route hashed for its in-flight mutex — i.e. what it actually parsed. */
const parsed = () => (hashPayload as jest.Mock).mock.calls[0][0] as { p: string; d: number; vt: string; i: boolean };
const debited = () => (deductCredits as jest.Mock).mock.calls[0][1] as number;

test('a 90 s female song re-roll is parsed as 90 s + female + fast and reserved at the 90 s tier', async () => {
  const spec = makeMusicRegenSpec({ prompt: 'summer night by the sea', genre: 'r&b', instrumental: false, durationSec: 90, tempo: 'fast', voiceType: 'female' });
  await POST(post(musicRegenBody(spec)));
  expect(parsed()).toMatchObject({ d: 90, vt: 'female', i: false });
  expect(parsed().p).toMatch(/fast, upbeat tempo/i);
  expect(debited()).toBe(creditCostFor('music', { seconds: 90 }));
  expect(debited()).toBeGreaterThan(creditCostFor('music', { seconds: 30 })); // the old re-roll's charge
});

test.each<[string, MusicRegenSpec]>([
  ['60 s instrumental', makeMusicRegenSpec({ prompt: 'rain piano', genre: 'ambient', instrumental: true, durationSec: 60, tempo: 'slow' })],
  ['full song', makeMusicRegenSpec({ prompt: 'epic ballad', genre: 'rock', instrumental: false, durationSec: 0, voiceType: 'duet' })],
  ['legacy spec (no duration stored)', { kind: 'music', prompt: 'old track', genre: 'jazz', instrumental: false }],
])('%s: the toast seconds price exactly what the ledger was debited', async (_label, spec) => {
  await POST(post(musicRegenBody(spec)));
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect(debited()).toBe(creditCostFor('music', { seconds: musicRegenBilledSeconds(spec) }));
});
