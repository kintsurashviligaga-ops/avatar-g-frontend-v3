/** @jest-environment node */
/**
 * POST /api/ai/music — (1) the model pill's `engine`: the picked engine runs INSTEAD of Lyria, alone — a miss is the explicit,
 * refunded failure, never another engine (R7); an engine the deployment cannot run, an unknown id, or MusicGen for a song
 * change nothing (Auto: Lyria alone). (2) The
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
import { refundCredits } from '../../../../lib/orchestrator/ledger';
import { runWithLatencyFailover } from '../../../../lib/providers/latencyFailover';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/ai/music', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const SONG = { prompt: 'a summer night by the sea', styles: ['pop'], durationSec: 30, tempo: 'medium', instrumental: false, vocalGender: 'auto' };
const BED = { ...SONG, instrumental: true };

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

const servedBy = async (body: unknown): Promise<string> => (await (await POST(post(body))).json()).engine as string;

/** The engines the route handed the failover helper — ONE, always (R7: no chain behind it). */
const attemptsHanded = (): string[] =>
  ((runWithLatencyFailover as jest.Mock).mock.calls.at(-1)?.[0] as Array<{ name: string }>).map((p) => p.name);

describe('`engine` — the model pill picks the ONE engine that runs', () => {
  test('without it (Auto) Lyria runs — and only Lyria is handed to the failover', async () => {
    expect(await servedBy(SONG)).toBe('Lyria');
    expect(attemptsHanded()).toEqual(['lyria']);
    expect(composeElevenLabsMusic).not.toHaveBeenCalled();
  });

  test('Auto: a Lyria miss is the explicit, refunded 502 — Udio, ElevenLabs and MusicGen are never asked', async () => {
    (generateLyriaTrack as jest.Mock).mockRejectedValue(new Error('Lyria 503'));
    for (const body of [SONG, BED]) {
      const res = await POST(post(body));
      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({ success: false, refunded: true });
      expect(attemptsHanded()).toEqual(['lyria']);
    }
    expect(refundCredits).toHaveBeenCalledTimes(2);
    expect(generateUdioTrack).not.toHaveBeenCalled();
    expect(composeElevenLabsMusic).not.toHaveBeenCalled();
    expect(generateMusic).not.toHaveBeenCalled();
  });

  test('Auto with Lyria not configured: the explicit, refunded 502 — the other configured engines are not promoted', async () => {
    (hasLyriaProvider as jest.Mock).mockReturnValue(false);
    const res = await POST(post(BED));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ success: false, refunded: true });
    expect(runWithLatencyFailover).not.toHaveBeenCalled();
    expect(generateUdioTrack).not.toHaveBeenCalled();
    expect(composeElevenLabsMusic).not.toHaveBeenCalled();
    expect(generateMusic).not.toHaveBeenCalled();
  });

  test('an unknown or non-string engine is Auto', async () => {
    for (const engine of ['suno', 7, null, {}, '']) {
      (generateLyriaTrack as jest.Mock).mockClear();
      expect(await servedBy({ ...SONG, engine })).toBe('Lyria');
    }
  });

});


