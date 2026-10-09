/** @jest-environment node */
/**
 * POST /api/ai/music — PROJECT_MASTER R7, "no silent fallback". A request runs ONE engine: Lyria on Auto, or the one the
 * user explicitly picked. When it fails — an error, a blown latency budget, or a circuit breaker already open — the
 * route answers its explicit 502 and refunds the reserve; no other engine is ever asked.
 *
 * Unlike the sibling suites this one runs the REAL lib/providers/latencyFailover, so the timeout and breaker legs are
 * the production code paths, not a mock's idea of them. Every provider, the ledger, storage and the idempotency store
 * are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn(async () => ({ response: null, auth: null, budgetRemaining: null })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/elevenlabs/music', () => ({ composeElevenLabsMusic: jest.fn(), hasElevenLabsMusicKey: jest.fn(() => true) }));
jest.mock('../../../../lib/ai/replicate', () => ({ generateMusicCover: jest.fn(), generateVoiceSong: jest.fn(), generateMusic: jest.fn() }));
jest.mock('../../../../lib/udio/client', () => ({ generateUdioTrack: jest.fn() }));
jest.mock('../../../../lib/ai/lyriaMusic', () => ({ hasLyriaProvider: jest.fn(() => true), generateLyriaTrack: jest.fn() }));
jest.mock('../../../../lib/chat/mediaKeys', () => ({ hasUdioApiKey: jest.fn(() => true) }));
jest.mock('../../../../lib/audio/trimAudio', () => ({ trimAudioToDuration: jest.fn(async () => null) }));
jest.mock('../../../../lib/audio/transcode', () => ({ transcodeVoiceToMp3: jest.fn() }));
jest.mock('../../../../lib/audio/rvc', () => ({ convertSongWithRvc: jest.fn() }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ getUserVoiceModel: jest.fn(async () => null), DEMO_VOICE_USER_ID: 'demo' }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://storage.example/signed.mp3'), createSignedAssetUrl: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  isProviderTripped: jest.fn(async () => false),
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
jest.mock('../../../../lib/ai/promptToEnglish', () => ({
  promptToEnglish: jest.fn(async (p: string) => p),
  lastTranslateOutcome: jest.fn(() => 'ok'),
}));
jest.mock('../../../../lib/audio/trackDuration', () => ({ probeTrackDurationSec: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { composeElevenLabsMusic } from '../../../../lib/elevenlabs/music';
import { generateLyriaTrack } from '../../../../lib/ai/lyriaMusic';
import { generateMusic } from '../../../../lib/ai/replicate';
import { generateUdioTrack } from '../../../../lib/udio/client';
import { isProviderTripped, recordProviderResult } from '../../../../lib/orchestrator/idempotency';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/ai/music', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const BED = { prompt: 'a summer night by the sea', styles: ['pop'], durationSec: 30, tempo: 'medium', instrumental: true, vocalGender: 'auto' };
const ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV };
  (isProviderTripped as jest.Mock).mockResolvedValue(false);
  (generateLyriaTrack as jest.Mock).mockResolvedValue({ base64: 'AAAA', mime: 'audio/mpeg' });
  // Every other engine WOULD succeed — so any track that comes back from one of them is a fallback that ran.
  (generateUdioTrack as jest.Mock).mockResolvedValue({ status: 'succeeded', audioUrl: 'https://udio.example/t.mp3' });
  (composeElevenLabsMusic as jest.Mock).mockResolvedValue({ audio: Buffer.from('el'), contentType: 'audio/mpeg' });
  (generateMusic as jest.Mock).mockResolvedValue({ audioUrl: 'https://replicate.delivery/track.mp3' });
  // Cover art (Pollinations) and the re-host both go through fetch — refuse them locally; the route keeps the URL.
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

/** The explicit failure: 502, the reserve refunded, and no engine but `ran` touched. */
async function expectExplicitFailure(body: unknown, ran: jest.Mock | null): Promise<void> {
  const res = await POST(post(body));
  expect(res.status).toBe(502);
  const json = await res.json();
  expect(json).toMatchObject({ success: false, refunded: true });
  expect(json).not.toHaveProperty('url');
  expect(deductCredits).toHaveBeenCalledTimes(1);
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect((refundCredits as jest.Mock).mock.calls[0][2]).toMatch(/:refund$/);
  for (const engine of [generateLyriaTrack, generateUdioTrack, composeElevenLabsMusic, generateMusic] as jest.Mock[]) {
    if (engine !== ran) expect(engine).not.toHaveBeenCalled();
  }
}

describe('Auto — Lyria, and nothing behind it', () => {
  test('a healthy Lyria serves the track (the baseline the failures below are measured against)', async () => {
    const json = await (await POST(post(BED))).json();
    expect(json).toMatchObject({ success: true, engine: 'Lyria' });
    expect(recordProviderResult).toHaveBeenCalledWith('lyria', true);
  });

  test('a Lyria ERROR is the explicit, refunded failure', async () => {
    (generateLyriaTrack as jest.Mock).mockRejectedValue(new Error('Lyria 503 overloaded'));
    await expectExplicitFailure(BED, generateLyriaTrack as jest.Mock);
    expect(recordProviderResult).toHaveBeenCalledWith('lyria', false); // the breaker still learns of it
  });

  test('a Lyria TIMEOUT (its latency budget blown) is the explicit, refunded failure', async () => {
    process.env.MUSIC_LYRIA_BUDGET_MS = '25';
    (generateLyriaTrack as jest.Mock).mockImplementation(() => new Promise(() => undefined)); // hangs
    await expectExplicitFailure(BED, generateLyriaTrack as jest.Mock);
    expect(recordProviderResult).toHaveBeenCalledWith('lyria', false);
  });

  test('Lyria\'s breaker OPEN: Lyria is not run, nothing else is either — the explicit, refunded failure', async () => {
    (isProviderTripped as jest.Mock).mockImplementation(async (p: string) => p === 'lyria');
    await expectExplicitFailure(BED, null);
    expect(isProviderTripped).toHaveBeenCalledTimes(1); // only the engine that would run is asked about
  });
});

describe('an explicit pick — that engine alone, the same rule', () => {
  test('a picked engine that errors is the explicit failure: Lyria is never run behind it', async () => {
    (composeElevenLabsMusic as jest.Mock).mockRejectedValue(new Error('ElevenLabs 429'));
    await expectExplicitFailure({ ...BED, engine: 'elevenlabs-music' }, composeElevenLabsMusic as jest.Mock);
  });

  test('a picked engine whose breaker is open is the explicit failure — not a reroute to Lyria', async () => {
    (isProviderTripped as jest.Mock).mockImplementation(async (p: string) => p === 'udio');
    await expectExplicitFailure({ ...BED, engine: 'udio' }, null);
  });
});

describe('"sing in my voice" — a missed conversion is said, not hidden', () => {
  test('the trained voice failed → the composed song ships with `voiceApplied: false`', async () => {
    const { getUserVoiceModel } = jest.requireMock('../../../../lib/audio/voiceModel') as { getUserVoiceModel: jest.Mock };
    const { convertSongWithRvc } = jest.requireMock('../../../../lib/audio/rvc') as { convertSongWithRvc: jest.Mock };
    getUserVoiceModel.mockResolvedValueOnce({ modelUrl: 'https://x.supabase.co/voice.zip' });
    convertSongWithRvc.mockRejectedValueOnce(new Error('rvc timeout'));
    const json = await (await POST(post({ ...BED, instrumental: false, lyrics: 'la la la', useMyVoice: true }))).json();
    expect(json).toMatchObject({ success: true, voiceApplied: false });
    expect(json.engine).not.toMatch(/your voice/i);
  });

  test('the trained voice converted → no `voiceApplied` flag', async () => {
    const { getUserVoiceModel } = jest.requireMock('../../../../lib/audio/voiceModel') as { getUserVoiceModel: jest.Mock };
    const { convertSongWithRvc } = jest.requireMock('../../../../lib/audio/rvc') as { convertSongWithRvc: jest.Mock };
    getUserVoiceModel.mockResolvedValueOnce({ modelUrl: 'https://x.supabase.co/voice.zip' });
    convertSongWithRvc.mockResolvedValueOnce('https://replicate.delivery/rvc.mp3');
    const json = await (await POST(post({ ...BED, instrumental: false, lyrics: 'la la la', useMyVoice: true }))).json();
    expect(json).toMatchObject({ success: true, engine: 'Your Voice (RVC)' });
    expect(json).not.toHaveProperty('voiceApplied');
  });
});
