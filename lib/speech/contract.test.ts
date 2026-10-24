/** @jest-environment node */
/**
 * lib/speech/contract — the PCM layout is taken only from a label that states it (§5.2: a rate is never guessed).
 */
import { isWavMime, normalizeSpeechLocale, pcmLayoutFromMime, SPEECH_CONTRACT_VERSION, SPEECH_HEADERS } from './contract';

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
