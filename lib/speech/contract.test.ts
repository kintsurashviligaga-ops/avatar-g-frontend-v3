/** @jest-environment node */
/**
 * lib/speech/contract — the PCM layout is taken only from a label that states it (§5.2: a rate is never guessed).
 */
import {
  isWavMime, normalizeSpeechLocale, pcmLayoutFromMime, SPEECH_CONTRACT_VERSION, SPEECH_HEADERS, speechPacing, speechProfile,
} from './contract';

describe('pcmLayoutFromMime', () => {
  test.each([
    ['audio/L16;codec=pcm;rate=24000', { sampleRate: 24000, channels: 1 }],
    ['audio/l16; rate=16000', { sampleRate: 16000, channels: 1 }],
    ['audio/pcm;rate=24000', { sampleRate: 24000, channels: 1 }],
    ['audio/L16;rate=48000;channels=2', { sampleRate: 48000, channels: 2 }],
  ])('%s → %j', (mime, layout) => {
    expect(pcmLayoutFromMime(mime)).toEqual(layout);
  });

  test.each([
    ['no rate', 'audio/L16;codec=pcm'],
    ['a rate that is not a whole number', 'audio/L16;rate=24000.5'],
    ['a rate below 8 kHz', 'audio/L16;rate=4000'],
    ['a rate above 96 kHz', 'audio/L16;rate=192000'],
    ['three channels', 'audio/L16;rate=24000;channels=3'],
    ['another codec', 'audio/L16;codec=mulaw;rate=8000'],
    ['a container, not raw PCM', 'audio/wav'],
    ['mp3', 'audio/mpeg'],
    ['empty', ''],
  ])('%s → null', (_why, mime) => {
    expect(pcmLayoutFromMime(mime)).toBeNull();
  });

  test('a non-string is null', () => {
    expect(pcmLayoutFromMime(undefined)).toBeNull();
    expect(pcmLayoutFromMime(24000)).toBeNull();
  });
});

test('isWavMime knows the WAV labels and nothing else', () => {
  for (const m of ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'AUDIO/WAV; codecs=1']) expect(isWavMime(m)).toBe(true);
  for (const m of ['audio/L16;rate=24000', 'audio/mpeg', '', null]) expect(isWavMime(m)).toBe(false);
});

test('normalizeSpeechLocale keeps en and ru, everything else is Georgian (the route rule today)', () => {
  expect(normalizeSpeechLocale('en')).toBe('en');
  expect(normalizeSpeechLocale('ru')).toBe('ru');
  expect(normalizeSpeechLocale('ka')).toBe('ka');
  expect(normalizeSpeechLocale('de')).toBe('ka');
  expect(normalizeSpeechLocale(undefined)).toBe('ka');
});

test('version 1, and the voice header keeps the name the clients already read', () => {
  expect(SPEECH_CONTRACT_VERSION).toBe(1);
  expect(SPEECH_HEADERS.voice).toBe('X-Voice-Name');
});

describe('speechPacing / speechProfile (what made the audio, for the replay cache)', () => {
  const answer = (extra: Record<string, string> = {}, drop?: string) => {
    const h = new Headers({
      [SPEECH_HEADERS.contract]: String(SPEECH_CONTRACT_VERSION),
      [SPEECH_HEADERS.pacing]: speechPacing(),
      [SPEECH_HEADERS.model]: 'gemini-2.5-flash-preview-tts',
      [SPEECH_HEADERS.voice]: 'Aoede',
      [SPEECH_HEADERS.sampleRate]: '24000',
      [SPEECH_HEADERS.channels]: '1',
      ...extra,
    });
    if (drop) h.delete(drop);
    return h;
  };

  test('the pacing names the language code, or auto', () => {
    expect(speechPacing('en-US')).toBe('1;lang=en-US');
    expect(speechPacing()).toBe('1;lang=auto');
  });

  test('every header that shapes the audio is in the profile', () => {
    expect(speechProfile(answer())).toBe('c1|p1;lang=auto|gemini-2.5-flash-preview-tts|Aoede|24000x1');
    const base = speechProfile(answer());
    for (const [k, v] of [
      [SPEECH_HEADERS.pacing, speechPacing('en-US')],
      [SPEECH_HEADERS.model, 'gemini-2.5-pro-preview-tts'],
      [SPEECH_HEADERS.voice, 'Charon'],
      [SPEECH_HEADERS.sampleRate, '16000'],
      [SPEECH_HEADERS.channels, '2'],
    ] as const) {
      expect(speechProfile(answer({ [k]: v }))).not.toBe(base);
    }
  });

  test.each([
    SPEECH_HEADERS.contract, SPEECH_HEADERS.pacing, SPEECH_HEADERS.model, SPEECH_HEADERS.voice,
    SPEECH_HEADERS.sampleRate, SPEECH_HEADERS.channels,
  ])('no %s → null: the audio is played, never kept', (header) => {
    expect(speechProfile(answer({}, header))).toBeNull();
  });

  test('an answer with no headers at all → null', () => {
    expect(speechProfile(undefined)).toBeNull();
  });

  test('another contract version, or a value that could forge the separator → null', () => {
    expect(speechProfile(answer({ [SPEECH_HEADERS.contract]: '2' }))).toBeNull();
    expect(speechProfile(answer({ [SPEECH_HEADERS.voice]: 'Aoede|x' }))).toBeNull();
  });
});
