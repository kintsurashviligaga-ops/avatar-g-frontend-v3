/** @jest-environment node */
/**
 * lib/chat/filmVoiceover — a long narration is read WHOLE, in one voice.
 *
 * ⚠️ The narration leg cut every script at 600 characters, mid-sentence, with nothing to say so. A Georgian film is now
 * voiced entirely off camera (one ElevenLabs voice over the whole cut, 2026-10-16), so a 48 s or 60 s narration would
 * have lost its ending. It is read in sentence-sized parts in the same voice and joined into one track. Every provider
 * and storage call is mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../veo/policy', () => ({ isGoogleOnly: jest.fn(() => true) }));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://storage.example/voiceover.mp3') }));
jest.mock('../elevenlabs/concurrency', () => ({ withElevenLabsSlot: jest.fn(<T,>(fn: () => Promise<T>) => fn()) }));

import { generateFilmVoiceover } from './filmVoiceover';
import { splitSpokenText } from './spokenText';
import { uploadAndSign } from '../orchestrator/storage-adapter';

const SENTENCE = 'წარმოგიდგენთ ახალ ქართულ სტუდიას, სადაც ერთი ფანჯრიდან ქმნით ვიდეოს, ხმას და მუსიკას.';
const LONG = Array.from({ length: 16 }, (_, i) => `${i + 1}. ${SENTENCE}`).join(' '); // ~1500 chars
const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;
const sentTexts = () => fetchSpy.mock.calls.map((c) => (JSON.parse(String((c[1] as RequestInit).body)) as { text: string }).text);

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, ELEVENLABS_API_KEY: 'el-test-key' };
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(new Uint8Array(2048).fill(7), { status: 200 }));
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
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
  expect(new Set(fetchSpy.mock.calls.map((c) => String(c[0]))).size).toBe(1);
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
  // The part holding sentence 9 is refused on every model.
  fetchSpy.mockImplementation(async (_url: unknown, init: RequestInit) => (String(init.body).includes('9. ')
    ? new Response('quota', { status: 429 })
    : new Response(new Uint8Array(2048), { status: 200 })));
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
