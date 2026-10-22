/** @jest-environment node */
/**
 * lib/chat/filmVoiceover — a long narration is read WHOLE, in one voice.
 *
 * ⚠️ The narration leg cut every script at 600 characters, mid-sentence, with nothing to say so. A Georgian film is now
 * voiced entirely off camera (one voice over the whole cut, 2026-10-16; Cloud TTS since MASTER TASK v3.1 PR 5d), so a
 * 48 s or 60 s narration would have lost its ending. It is read in sentence-sized parts in the same voice and joined into
 * one track. Every provider and storage call is mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../veo/policy', () => ({ isGoogleOnly: jest.fn(() => true) }));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://storage.example/voiceover.mp3') }));
jest.mock('../audio/google-tts', () => ({
  ...jest.requireActual('../audio/google-tts'),
  synthesizeGoogleTts: jest.fn(),
}));

import { generateFilmVoiceover } from './filmVoiceover';
import { splitSpokenText } from './spokenText';
import { uploadAndSign } from '../orchestrator/storage-adapter';
import { synthesizeGoogleTts } from '../audio/google-tts';

const SENTENCE = 'წარმოგიდგენთ ახალ ქართულ სტუდიას, სადაც ერთი ფანჯრიდან ქმნით ვიდეოს, ხმას და მუსიკას.';
const LONG = Array.from({ length: 16 }, (_, i) => `${i + 1}. ${SENTENCE}`).join(' '); // ~1500 chars
const google = synthesizeGoogleTts as jest.MockedFunction<typeof synthesizeGoogleTts>;
const sentTexts = () => google.mock.calls.map((c) => c[0]);

beforeEach(() => {
  jest.clearAllMocks();
  google.mockImplementation(async () => new Uint8Array(2048).fill(7).buffer);
});

test('a 1500-character Georgian narration is read whole, in order, in parts of at most 600 characters', async () => {
  expect(LONG.length).toBeGreaterThan(1200);
  const url = await generateFilmVoiceover({ brief: 'ad', totalSec: 120, compositeId: 'film:s:1', narrationScript: LONG, voicePersona: 'male', voiceLanguage: 'ka' });
  expect(url).toBe('https://storage.example/voiceover.mp3');
  const texts = sentTexts();
  expect(texts.length).toBeGreaterThanOrEqual(3);
  for (const t of texts) expect(t.length).toBeLessThanOrEqual(600);
  expect(texts.join(' ')).toBe(LONG);
  // Every part in the same voice.
  expect(new Set(google.mock.calls.map((c) => JSON.stringify(c[1]))).size).toBe(1);
  expect(google.mock.calls[0]![1]).toMatchObject({ languageCode: 'ka-GE', gender: 'MALE' });
  // One track: the parts' bytes, joined, uploaded once.
  expect(uploadAndSign).toHaveBeenCalledTimes(1);
  const b64 = (uploadAndSign as jest.Mock).mock.calls[0]![2] as string;
  expect(Buffer.from(b64, 'base64').byteLength).toBe(2048 * texts.length);
});

test('a short narration is still exactly one request (unchanged)', async () => {
  await generateFilmVoiceover({ brief: 'ad', totalSec: 32, compositeId: 'film:s:2', narrationScript: SENTENCE, voicePersona: 'male', voiceLanguage: 'ka' });
  expect(sentTexts()).toEqual([SENTENCE]);
});

test('a part the provider cannot read fails the whole voice — never a track with a hole in it', async () => {
  // The part holding sentence 9 is refused.
  google.mockImplementation(async (text: string) => (text.includes('9. ') ? null : new Uint8Array(2048).buffer));
  expect(await generateFilmVoiceover({ brief: 'ad', totalSec: 120, compositeId: 'film:s:3', narrationScript: LONG, voicePersona: 'male', voiceLanguage: 'ka' })).toBeNull();
  expect(uploadAndSign).not.toHaveBeenCalled();
});

describe('splitSpokenText', () => {
  test('cuts between sentences, keeps every word in order', () => {
    const parts = splitSpokenText(LONG, 600);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(600);
    expect(parts.join(' ')).toBe(LONG);
    for (const p of parts) expect(p).toMatch(/\.$/);
  });

  test('a sentence longer than a part is cut at a clause, then between words', () => {
    const run = Array.from({ length: 30 }, () => 'სიტყვა').join(' ');
    const text = `${run}, ${run}.`;
    const parts = splitSpokenText(text, 120);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(120);
    expect(parts.join(' ')).toBe(text);
  });

  test('empty in, nothing out; short in, one part', () => {
    expect(splitSpokenText('  ', 600)).toEqual([]);
    expect(splitSpokenText(SENTENCE, 600)).toEqual([SENTENCE]);
  });
});
