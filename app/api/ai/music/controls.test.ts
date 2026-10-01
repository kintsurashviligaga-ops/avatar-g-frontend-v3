/** @jest-environment node */
/**
 * POST /api/ai/music — the granular controls (lib/ai/musicControls): up to three styles, the singer (Auto / Female /
 * Male / Duet) and the Weirdness / Style influence sliders.
 *
 * Pinned at what each engine receives and at the response: the styles become one line, the sliders become sentences in
 * the brief AFTER the translation (approximate on Lyria — `controls.mode` 'prompt'), real sampling parameters on
 * MusicGen ('native'), and Udio's native fields only behind MUSIC_SUNO_PARAMS; an untouched panel composes exactly the
 * brief it always did; the in-flight mutex keys on the controls. Every provider, the ledger, storage and the
 * idempotency store are mocked, and the failover mock runs the chain in order — no network, no spend.
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
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://storage.example/signed.mp3'), createSignedAssetUrl: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));
jest.mock('../../../../lib/providers/latencyFailover', () => ({
  // The chain in order, first success wins — the real failover minus its timers.
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
import { generateLyriaTrack, hasLyriaProvider } from '../../../../lib/ai/lyriaMusic';
import { generateMusic, generateMusicCover } from '../../../../lib/ai/replicate';
import { generateUdioTrack } from '../../../../lib/udio/client';
import { hasUdioApiKey } from '../../../../lib/chat/mediaKeys';
import { hashPayload } from '../../../../lib/orchestrator/idempotency';
import { promptToEnglish } from '../../../../lib/ai/promptToEnglish';
import { promptDirectives, udioParams } from '../../../../lib/ai/musicControls';
import { resolveTemplateContext } from '../../../../lib/studio/templateContext';
import { musicTemplateValues } from '../../../../lib/studio/templates';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/ai/music', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const PROMPT = 'a summer night by the sea, warm and slow';
const PANEL = { prompt: PROMPT, style: 'georgian folk, jazz', styles: ['georgian folk', 'jazz'], durationSec: 30, tempo: 'medium', instrumental: false, vocalGender: 'duet', weirdness: 92, styleInfluence: 10 };
const [WEIRD, LOOSE] = promptDirectives({ weirdness: 92, styleInfluence: 10 });
const ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV };
  delete process.env.MUSIC_SUNO_PARAMS;
  (hasLyriaProvider as jest.Mock).mockReturnValue(true);
  (hasUdioApiKey as jest.Mock).mockReturnValue(false);
  (generateLyriaTrack as jest.Mock).mockResolvedValue({ base64: 'AAAA', mime: 'audio/mpeg' });
  // Cover art (Pollinations) and the re-host both go through fetch — refuse them locally; the route keeps the URL.
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

const lyriaBrief = (): string => (generateLyriaTrack as jest.Mock).mock.calls[0][0].prompt as string;
const mutexKey = (): Record<string, unknown> => (hashPayload as jest.Mock).mock.calls[0][0];

describe('Lyria (primary): the controls are sentences in the brief — approximate, and reported as such', () => {
  test('the panel\'s styles, singer and sliders all reach the brief; the result says "prompt"', async () => {
    const res = await POST(post(PANEL));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, engine: 'Lyria', controls: { engine: 'lyria', mode: 'prompt' } });

    const brief = lyriaBrief();
    expect(brief).toContain(PROMPT);
    expect(brief).toContain('Style: georgian folk, jazz.');
    expect(brief).toContain('male and female duet');
    expect(brief.endsWith(`${WEIRD} ${LOOSE}`)).toBe(true); // last: the lowest priority
  });

  test('the sentences join AFTER the translation — the translator never sees them', async () => {
    await POST(post(PANEL));
    for (const [text] of (promptToEnglish as jest.Mock).mock.calls) {
      expect(text).not.toContain(WEIRD!);
      expect(text).not.toContain(LOOSE!);
    }
    expect(lyriaBrief()).toContain(WEIRD);
  });

  test('an untouched panel (50 / 50) composes exactly the brief a body without controls does', async () => {
    await POST(post({ ...PANEL, weirdness: 50, styleInfluence: 50 }));
    const withNeutral = lyriaBrief();
    (generateLyriaTrack as jest.Mock).mockClear();
    const { weirdness: _w, styleInfluence: _s, ...legacy } = PANEL;
    await POST(post(legacy));
    expect(lyriaBrief()).toBe(withNeutral);
    expect(withNeutral).not.toMatch(/experimental|conventional|stated style/i);
  });

  test('Auto names no singer; a body from an earlier build (`voiceType`) still does', async () => {
    await POST(post({ ...PANEL, vocalGender: 'auto' }));
    expect(lyriaBrief()).not.toMatch(/vocals|singer|duet/i);
    expect(mutexKey().vt).toBe('');
    (generateLyriaTrack as jest.Mock).mockClear();
    (hashPayload as jest.Mock).mockClear();
    const { vocalGender: _v, ...older } = PANEL;
    await POST(post({ ...older, voiceType: 'male' }));
    expect(lyriaBrief()).toContain('male vocals, male singer');
    expect(mutexKey().vt).toBe('male');
  });

  test('styles are capped at three clean labels and win over a stale `style`', async () => {
    await POST(post({ ...PANEL, style: 'polka', styles: ['rock', 'Rock', 'metal‮', 'trap', 'k-pop'] }));
    expect(lyriaBrief()).toContain('Style: rock, metal, trap.');
    expect(lyriaBrief()).not.toContain('polka');
    expect(mutexKey().st).toBe('rock, metal, trap');
  });
});

describe('the in-flight mutex keys on the controls — a changed slider is a new request', () => {
  test('the key carries the style line and both sliders', async () => {
    await POST(post(PANEL));
    expect(mutexKey()).toMatchObject({ st: 'georgian folk, jazz', vt: 'duet', w: 92, si: 10 });
  });

  test('an absent or junk slider keys as the neutral 50', async () => {
    await POST(post({ ...PANEL, weirdness: 'loud', styleInfluence: undefined }));
    expect(mutexKey()).toMatchObject({ w: 50, si: 50 });
  });
});

describe('a template card applies only while its genre is the sole style', () => {
  const FOLK = musicTemplateValues('georgian-folk')!;
  const FOLK_BODY = { prompt: PROMPT, styles: [FOLK.genre], durationSec: FOLK.duration, tempo: FOLK.tempo, instrumental: FOLK.instrumental, vocalGender: FOLK.voiceType, templateId: 'georgian-folk' };
  const DESCRIPTOR = resolveTemplateContext('music', 'georgian-folk', FOLK)!.descriptor;

  test('the card\'s own values: the descriptor lands', async () => {
    await POST(post(FOLK_BODY));
    expect(lyriaBrief()).toContain(DESCRIPTOR);
    expect(mutexKey().t).toBe('georgian-folk');
  });

  test('a second style is an edit away from the card: no descriptor', async () => {
    await POST(post({ ...FOLK_BODY, styles: [FOLK.genre, 'jazz'] }));
    expect(lyriaBrief()).not.toContain(DESCRIPTOR);
    expect(mutexKey().t).toBeNull();
  });

  test('the singer on Auto is an edit away from a sung card: no descriptor', async () => {
    await POST(post({ ...FOLK_BODY, vocalGender: 'auto' }));
    expect(lyriaBrief()).not.toContain(DESCRIPTOR);
  });
});

describe('native engines', () => {
  test('MusicGen takes the sliders as sampling parameters, and says so ("native")', async () => {
    (hasLyriaProvider as jest.Mock).mockReturnValue(false);
    (generateMusic as jest.Mock).mockResolvedValue({ audioUrl: 'https://replicate.delivery/track.mp3' });
    const res = await POST(post({ ...PANEL, instrumental: true }));
    const json = await res.json();
    expect(json).toMatchObject({ success: true, engine: 'MusicGen', controls: { engine: 'musicgen', mode: 'native' } });
    expect((generateMusic as jest.Mock).mock.calls[0][2]).toEqual({ temperature: 1.25, classifierFreeGuidance: 1.4 });
  });

  test('a SONG that falls through to MusicGen is badged as voiceless even with the singer on Auto and no lyrics', async () => {
    (hasLyriaProvider as jest.Mock).mockReturnValue(false);
    (generateMusic as jest.Mock).mockResolvedValue({ audioUrl: 'https://replicate.delivery/track.mp3' });
    const json = await (await POST(post({ ...PANEL, vocalGender: 'auto' }))).json();
    expect(json.engine).toBe('MusicGen (instrumental — vocals unavailable)');
  });

  test('Udio gets its native fields handed over, but with MUSIC_SUNO_PARAMS off (the default) the result says "prompt"', async () => {
    (hasLyriaProvider as jest.Mock).mockReturnValue(false);
    (hasUdioApiKey as jest.Mock).mockReturnValue(true);
    (generateUdioTrack as jest.Mock).mockResolvedValue({ status: 'succeeded', audioUrl: 'https://udio.example/t.mp3' });
    const body = { ...PANEL, vocalGender: 'female' };
    const json = await (await POST(post(body))).json();
    expect(json.controls).toEqual({ engine: 'udio', mode: 'prompt' });
    const input = (generateUdioTrack as jest.Mock).mock.calls[0][0];
    expect(input.controls).toEqual(udioParams({ styles: [], vocalGender: 'female', weirdness: 92, styleInfluence: 10 }, { instrumental: false }));
    expect(input.style).toBe('georgian folk, jazz');
    expect(input.prompt).toContain(WEIRD); // the sentences ride along either way
  });

  test('…and with MUSIC_SUNO_PARAMS=1 the same track reports "native"', async () => {
    process.env.MUSIC_SUNO_PARAMS = '1';
    (hasLyriaProvider as jest.Mock).mockReturnValue(false);
    (hasUdioApiKey as jest.Mock).mockReturnValue(true);
    (generateUdioTrack as jest.Mock).mockResolvedValue({ status: 'succeeded', audioUrl: 'https://udio.example/t.mp3' });
    const json = await (await POST(post(PANEL))).json();
    expect(json.controls).toEqual({ engine: 'udio', mode: 'native' });
  });
});

test('a cover keeps its own source: no slider sentences, no controls report', async () => {
  (generateMusicCover as jest.Mock).mockResolvedValue({ audioUrl: 'https://replicate.delivery/cover.mp3' });
  const json = await (await POST(post({ ...PANEL, audioReference: 'https://cdn.example.com/track.mp3' }))).json();
  expect(json.success).toBe(true);
  expect(json).not.toHaveProperty('controls');
  expect(generateLyriaTrack).not.toHaveBeenCalled();
  expect((generateMusicCover as jest.Mock).mock.calls[0][0]).not.toContain(WEIRD);
});
