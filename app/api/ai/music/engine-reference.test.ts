/** @jest-environment node */
/**
 * POST /api/ai/music — (1) the model pill's `engine`: one engine goes to the FRONT of the chain and the rest stay behind it
 * as fallbacks; an engine the chain does not have, an unknown id, or MusicGen for a song change nothing. (2) The
 * `audioReference` / `voiceReference` rule: a storage path must be the caller's own, a voice sample's URL must be our
 * own storage (we fetch it), a cover's URL must not be an internal address — and a refusal happens BEFORE the mutex or the
 * ledger is touched. Every provider, the ledger, storage and the idempotency store are mocked: no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn(async () => ({ response: null, auth: null, budgetRemaining: null })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/elevenlabs/music', () => ({ composeElevenLabsMusic: jest.fn(), hasElevenLabsMusicKey: jest.fn(() => false) }));
jest.mock('../../../../lib/ai/replicate', () => ({ generateMusicCover: jest.fn(), generateVoiceSong: jest.fn(), generateMusic: jest.fn() }));
jest.mock('../../../../lib/udio/client', () => ({ generateUdioTrack: jest.fn() }));
jest.mock('../../../../lib/ai/lyriaMusic', () => ({ hasLyriaProvider: jest.fn(), generateLyriaTrack: jest.fn() }));
jest.mock('../../../../lib/chat/mediaKeys', () => ({ hasUdioApiKey: jest.fn() }));
jest.mock('../../../../lib/audio/trimAudio', () => ({ trimAudioToDuration: jest.fn(async () => null) }));
jest.mock('../../../../lib/audio/transcode', () => ({ transcodeVoiceToMp3: jest.fn() }));
jest.mock('../../../../lib/audio/rvc', () => ({ convertSongWithRvc: jest.fn() }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ getUserVoiceModel: jest.fn(async () => null), DEMO_VOICE_USER_ID: 'demo' }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  uploadAndSign: jest.fn(async () => 'https://storage.example/signed.mp3'),
  createSignedAssetUrl: jest.fn(async () => 'https://signed.example/ref.mp3'),
}));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));
jest.mock('../../../../lib/providers/latencyFailover', () => ({
  // The chain in order, first success wins — the real failover minus its timers. `provider` says who served it.
  runWithLatencyFailover: jest.fn(async (providers: Array<{ name: string; run: (s: AbortSignal) => Promise<unknown> }>) => {
    for (const p of providers) {
      try { return { ok: true, result: await p.run(new AbortController().signal), provider: p.name, attempts: [] }; } catch { /* next */ }
    }
    return { ok: false, attempts: [] };
  }),
}));
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
import { composeElevenLabsMusic, hasElevenLabsMusicKey } from '../../../../lib/elevenlabs/music';
import { generateLyriaTrack, hasLyriaProvider } from '../../../../lib/ai/lyriaMusic';
import { generateMusic, generateMusicCover, generateVoiceSong } from '../../../../lib/ai/replicate';
import { generateUdioTrack } from '../../../../lib/udio/client';
import { hasUdioApiKey } from '../../../../lib/chat/mediaKeys';
import { transcodeVoiceToMp3 } from '../../../../lib/audio/transcode';
import { createSignedAssetUrl } from '../../../../lib/orchestrator/storage-adapter';
import { deductCredits } from '../../../../lib/orchestrator/ledger';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/ai/music', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const SONG = { prompt: 'a summer night by the sea', styles: ['pop'], durationSec: 30, tempo: 'medium', instrumental: false, vocalGender: 'auto' };

beforeEach(() => {
  jest.clearAllMocks();
  (hasLyriaProvider as jest.Mock).mockReturnValue(true);
  (hasUdioApiKey as jest.Mock).mockReturnValue(true);
  (hasElevenLabsMusicKey as jest.Mock).mockReturnValue(true);
  (generateLyriaTrack as jest.Mock).mockResolvedValue({ base64: 'AAAA', mime: 'audio/mpeg' });
  (composeElevenLabsMusic as jest.Mock).mockResolvedValue({ audio: Buffer.from('el'), contentType: 'audio/mpeg' });
  (generateUdioTrack as jest.Mock).mockResolvedValue({ status: 'succeeded', audioUrl: 'https://udio.example/t.mp3' });
  (generateMusic as jest.Mock).mockResolvedValue({ audioUrl: 'https://replicate.delivery/track.mp3' });
  (generateMusicCover as jest.Mock).mockResolvedValue({ audioUrl: 'https://replicate.delivery/cover.mp3' });
  (generateVoiceSong as jest.Mock).mockResolvedValue({ audioUrl: 'https://replicate.delivery/voice.mp3' });
  (transcodeVoiceToMp3 as jest.Mock).mockResolvedValue('https://storage.example/voice.mp3');
  (createSignedAssetUrl as jest.Mock).mockResolvedValue('https://signed.example/ref.mp3');
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());


test.each(['udio', 'elevenlabs-music', 'musicgen'])('a retired engine selection %s cannot override Lyria', async (engine) => {
  const result = await POST(post({ ...SONG, engine }));
  expect(result.status).toBe(200);
  expect(generateLyriaTrack).toHaveBeenCalledTimes(1);
  expect(generateUdioTrack).not.toHaveBeenCalled();
  expect(composeElevenLabsMusic).not.toHaveBeenCalled();
  expect(generateMusic).not.toHaveBeenCalled();
});
test('a failed Lyria request cannot trigger a retired fallback', async () => {
  (generateLyriaTrack as jest.Mock).mockResolvedValue(null);
  const result = await POST(post(SONG));
  expect(result.status).toBe(502);
  expect(generateUdioTrack).not.toHaveBeenCalled();
  expect(composeElevenLabsMusic).not.toHaveBeenCalled();
  expect(generateMusic).not.toHaveBeenCalled();
});
test.each([
  { audioReference: 'user-1/upload.wav' }, { voiceReference: 'https://test.supabase.co/storage/v1/object/public/voice.wav' },
  { useMyVoice: true }, { audioReference: 'http://169.254.169.254/latest/meta-data/' }, { voiceReference: 'data:audio/wav;base64,AAAA' },
])('unsupported music reference %j is rejected before charging, fetching or generation', async (reference) => {
  const response = await POST(post({ ...SONG, ...reference }));
  expect(response.status).toBe(422);
  expect(deductCredits).not.toHaveBeenCalled();
  expect(createSignedAssetUrl).not.toHaveBeenCalled();
  expect(transcodeVoiceToMp3).not.toHaveBeenCalled();
  expect(generateMusicCover).not.toHaveBeenCalled();
  expect(generateVoiceSong).not.toHaveBeenCalled();
  expect(generateLyriaTrack).not.toHaveBeenCalled();
});
