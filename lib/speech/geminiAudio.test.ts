/** @jest-environment node */
/**
 * lib/speech/geminiAudio — every audio part of a Gemini TTS answer is read, in order, and wrapped once (§5.2).
 */
import { audioFromGeminiParts } from './geminiAudio';
import { WAV_HEADER_BYTES, wrapPcm16 } from './wav';
import {
  L16_24K,
  MONO_16K,
  MONO_24K,
  MULTI_PART_24K,
  PCM_ODD_BYTES,
  STEREO_24K,
  WAV_DOUBLE_WRAPPED,
  WAV_MONO_24K,
  WAV_TRUNCATED,
  geminiAudioBody,
  type GeminiPart,
} from '../../tests/fixtures/speechAudio';

/** The `parts` array exactly as the route hands it over. */
const partsOf = (parts: GeminiPart[]) =>
  (geminiAudioBody(parts) as { candidates: Array<{ content: { parts: unknown[] } }> }).candidates[0]!.content.parts;

const concat = (...chunks: Uint8Array[]) => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
};

test('one PCM part: the same WAV the route has always written', () => {
  const r = audioFromGeminiParts(partsOf([{ pcm: MONO_24K, mimeType: L16_24K }]));
  expect(r.ok && Buffer.from(r.wav).equals(Buffer.from(WAV_MONO_24K))).toBe(true);
  expect(r.ok && r.info).toMatchObject({ sampleRate: 24000, channels: 1, frames: 24000, durationMs: 1000 });
});

test('three PCM parts are joined in the order they came, under one header (none is dropped)', () => {
  const r = audioFromGeminiParts(partsOf(MULTI_PART_24K.map((pcm) => ({ pcm, mimeType: L16_24K }))));
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.audioParts).toBe(3);
  expect(r.info).toMatchObject({ frames: 28800, durationMs: 1200 });
  expect(Buffer.from(r.wav.subarray(WAV_HEADER_BYTES)).equals(Buffer.from(concat(...MULTI_PART_24K)))).toBe(true);
});

test('a WAV part keeps only its samples: by label, and by its RIFF bytes under a PCM label', () => {
  for (const mimeType of ['audio/wav', L16_24K]) {
    const r = audioFromGeminiParts(partsOf([{ pcm: WAV_MONO_24K, mimeType }]));
    expect(r.ok && Buffer.from(r.wav).equals(Buffer.from(WAV_MONO_24K))).toBe(true);
  }
});

test('a WAV part and a PCM part at the same rate are joined', () => {
  const r = audioFromGeminiParts(partsOf([{ pcm: WAV_MONO_24K, mimeType: 'audio/wav' }, { pcm: MONO_24K, mimeType: L16_24K }]));
  expect(r.ok && r.info.frames).toBe(48000);
});

test('stereo keeps its two channels; the rate and layout come from the label, never a default', () => {
  const stereo = audioFromGeminiParts(partsOf([{ pcm: STEREO_24K, mimeType: 'audio/L16;rate=24000;channels=2' }]));
  expect(stereo.ok && stereo.info).toMatchObject({ channels: 2, frames: 6000, durationMs: 250 });
  const sixteen = audioFromGeminiParts(partsOf([{ pcm: MONO_16K, mimeType: 'audio/L16;codec=pcm;rate=16000' }]));
  expect(sixteen.ok && sixteen.info).toMatchObject({ sampleRate: 16000, durationMs: 500 });
});

test('text parts are ignored', () => {
  const r = audioFromGeminiParts(partsOf([{ text: 'Here is the audio.' }, { pcm: MONO_24K, mimeType: L16_24K }]));
  expect(r.ok && r.audioParts).toBe(1);
});

test.each([
  ['nothing at all', undefined],
  ['not an array', { inlineData: {} }],
  ['an empty list', []],
  ['text only', partsOf([{ text: 'no audio' }])],
  ['an empty data string', [{ inlineData: { mimeType: L16_24K, data: '' } }]],
])('%s → no_audio', (_why, parts) => {
  expect(audioFromGeminiParts(parts)).toEqual({ ok: false, fault: 'no_audio', audioParts: 0, audioBytes: 0 });
});

test.each([
  ['a WAV wrapped twice', [{ pcm: WAV_DOUBLE_WRAPPED, mimeType: 'audio/wav' }], 'double_wrapped'],
  ['a WAV cut short', [{ pcm: WAV_TRUNCATED, mimeType: 'audio/wav' }], 'truncated'],
  ['PCM with no rate', [{ pcm: MONO_24K, mimeType: 'audio/L16;codec=pcm' }], 'unlabelled'],
  ['PCM with no label', [{ pcm: MONO_24K, mimeType: '' }], 'unlabelled'],
  ['mp3 bytes', [{ pcm: MONO_24K, mimeType: 'audio/mpeg' }], 'unlabelled'],
  ['half a sample', [{ pcm: PCM_ODD_BYTES, mimeType: L16_24K }], 'partial_frame'],
  ['half a stereo frame', [{ pcm: new Uint8Array(6), mimeType: 'audio/L16;rate=24000;channels=2' }], 'partial_frame'],
  ['two rates', [{ pcm: MONO_24K, mimeType: L16_24K }, { pcm: MONO_16K, mimeType: 'audio/L16;rate=16000' }], 'mixed_layout'],
  [
    'mono then stereo',
    [{ pcm: MONO_24K, mimeType: L16_24K }, { pcm: wrapPcm16(STEREO_24K, { sampleRate: 24000, channels: 2 }), mimeType: 'audio/wav' }],
    'mixed_layout',
  ],
] as Array<[string, GeminiPart[], string]>)('%s → %s, with the bytes read so far', (_why, parts, fault) => {
  const r = audioFromGeminiParts(partsOf(parts));
  expect(r).toMatchObject({ ok: false, fault, audioParts: parts.length });
  expect(!r.ok && r.audioBytes).toBeGreaterThan(0);
});

test('base64 that does not decode → bad_base64', () => {
  const r = audioFromGeminiParts([{ inlineData: { mimeType: L16_24K, data: '!!not base64!!' } }]);
  expect(r).toEqual({ ok: false, fault: 'bad_base64', audioParts: 1, audioBytes: 0 });
});
