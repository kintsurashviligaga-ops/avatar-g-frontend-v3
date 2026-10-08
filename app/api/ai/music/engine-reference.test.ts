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
import { claimIdempotencyKey, hashPayload } from '../../../../lib/orchestrator/idempotency';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
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

  test('ElevenLabs Music picked: it composes, and Lyria is never asked', async () => {
    expect(await servedBy({ ...SONG, engine: 'elevenlabs-music' })).toBe('ElevenLabs Music');
    expect(generateLyriaTrack).not.toHaveBeenCalled();
  });

  test('Udio picked: it runs instead of Lyria, alone', async () => {
    expect(await servedBy({ ...SONG, engine: 'udio' })).toBe('Udio');
    expect(attemptsHanded()).toEqual(['udio']);
    expect(generateLyriaTrack).not.toHaveBeenCalled();
  });

  test('a picked engine that misses is the explicit, refunded 502 — Lyria is NOT run behind it (R7)', async () => {
    (composeElevenLabsMusic as jest.Mock).mockRejectedValue(new Error('402'));
    const res = await POST(post({ ...SONG, engine: 'elevenlabs-music' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ success: false, refunded: true });
    expect(attemptsHanded()).toEqual(['elevenlabs-music']);
    expect(composeElevenLabsMusic).toHaveBeenCalledTimes(1);
    expect(generateLyriaTrack).not.toHaveBeenCalled();
    expect(generateUdioTrack).not.toHaveBeenCalled();
    expect(generateMusic).not.toHaveBeenCalled();
  });

  test('MusicGen picked for an INSTRUMENTAL runs — and is the engine that rendered it', async () => {
    const json = await (await POST(post({ ...BED, engine: 'musicgen' }))).json();
    expect(json.engine).toBe('MusicGen');
    expect(generateLyriaTrack).not.toHaveBeenCalled();
  });

  test('MusicGen picked for a SONG is ignored: it makes no vocals, so Auto (Lyria) runs', async () => {
    expect(await servedBy({ ...SONG, engine: 'musicgen' })).toBe('Lyria');
    expect(attemptsHanded()).toEqual(['lyria']);
    expect(generateMusic).not.toHaveBeenCalled();
  });

  test('an engine the deployment cannot run (no Udio key) is a no-op — Auto (Lyria)', async () => {
    (hasUdioApiKey as jest.Mock).mockReturnValue(false);
    expect(await servedBy({ ...SONG, engine: 'udio' })).toBe('Lyria');
    expect(generateUdioTrack).not.toHaveBeenCalled();
  });

  test('an unknown or non-string engine is Auto', async () => {
    for (const engine of ['suno', 7, null, {}, '']) {
      (generateLyriaTrack as jest.Mock).mockClear();
      expect(await servedBy({ ...SONG, engine })).toBe('Lyria');
    }
  });

  test('a different pick is a different request to the in-flight mutex', async () => {
    await POST(post({ ...SONG, engine: 'udio' }));
    expect((hashPayload as jest.Mock).mock.calls[0][0]).toMatchObject({ pe: 'udio' });
    (hashPayload as jest.Mock).mockClear();
    await POST(post(SONG));
    expect((hashPayload as jest.Mock).mock.calls[0][0]).toMatchObject({ pe: null });
  });

  test('the price does not depend on the engine: the ledger is debited the same for every pick', async () => {
    await POST(post({ ...SONG, durationSec: 60, engine: 'elevenlabs-music' }));
    await POST(post({ ...SONG, durationSec: 60 }));
    const amounts = (deductCredits as jest.Mock).mock.calls.map((c) => c[1]);
    expect(amounts).toEqual([8, 8]);
  });
});

describe('references — the caller\'s own paths, our own storage for a fetched voice, no internal addresses', () => {
  const refused = async (body: unknown) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'invalid_reference' });
    // Nothing was reserved, signed, fetched or composed.
    expect(deductCredits).not.toHaveBeenCalled();
    expect(claimIdempotencyKey).not.toHaveBeenCalled();
    expect(createSignedAssetUrl).not.toHaveBeenCalled();
    expect(transcodeVoiceToMp3).not.toHaveBeenCalled();
    expect(generateMusicCover).not.toHaveBeenCalled();
    expect(generateLyriaTrack).not.toHaveBeenCalled();
  };

  test('the caller\'s own upload path is signed and used as the cover melody', async () => {
    const res = await POST(post({ ...SONG, audioReference: 'omni-uploads/user-1/1700000000-ab12cd34.mp3' }));
    expect(res.status).toBe(200);
    expect(createSignedAssetUrl).toHaveBeenCalledWith(expect.any(String), 'omni-uploads/user-1/1700000000-ab12cd34.mp3', 3600);
    expect((generateMusicCover as jest.Mock).mock.calls[0][1]).toBe('https://signed.example/ref.mp3');
  });

  test('ANOTHER account\'s path is refused before anything is signed or charged', async () => {
    await refused({ ...SONG, audioReference: 'omni-uploads/user-2/1700000000-ab12cd34.mp3' });
  });

  test('a path that climbs out of the caller\'s folder is refused', async () => {
    await refused({ ...SONG, audioReference: 'omni-uploads/user-1/../user-2/x.mp3' });
    await refused({ ...SONG, voiceReference: 'omni-uploads/user-1/../../secrets/x.mp3' });
  });

  test('a path with no owner folder at all is refused', async () => {
    await refused({ ...SONG, audioReference: 'omni-music/12345-abc.mp3' });
  });

  test('a voice sample: our own storage URL passes, and the transcoder is handed exactly that URL', async () => {
    const own = 'https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/uploads/omni-uploads/user-1/a.mp3?token=t';
    const res = await POST(post({ ...SONG, voiceReference: own }));
    expect(res.status).toBe(200);
    expect(transcodeVoiceToMp3).toHaveBeenCalledWith(own);
  });

  test('a voice sample at any other host — or an internal address — is refused (we fetch it ourselves)', async () => {
    await refused({ ...SONG, voiceReference: 'https://evil.example.com/voice.mp3' });
    await refused({ ...SONG, voiceReference: 'http://169.254.169.254/latest/meta-data/' });
    await refused({ ...SONG, voiceReference: 'https://localhost:3000/x.mp3' });
  });

  test('a cover URL on a public host passes; loopback / private / metadata addresses do not', async () => {
    const ok = await POST(post({ ...SONG, audioReference: 'https://cdn.example.com/track.mp3' }));
    expect(ok.status).toBe(200);
    jest.clearAllMocks();
    await refused({ ...SONG, audioReference: 'http://127.0.0.1:8080/track.mp3' });
    await refused({ ...SONG, audioReference: 'http://10.0.0.5/track.mp3' });
    await refused({ ...SONG, audioReference: 'http://169.254.169.254/' });
  });

  test('a data: URL must declare itself audio', async () => {
    await refused({ ...SONG, audioReference: 'data:text/html;base64,PGgxPmhpPC9oMT4=' });
    const ok = await POST(post({ ...SONG, audioReference: 'data:audio/mpeg;base64,AAAA' }));
    expect(ok.status).toBe(200);
  });

  test('no reference at all is untouched by the rule', async () => {
    const res = await POST(post(SONG));
    expect(res.status).toBe(200);
    expect(createSignedAssetUrl).not.toHaveBeenCalled();
  });
});
