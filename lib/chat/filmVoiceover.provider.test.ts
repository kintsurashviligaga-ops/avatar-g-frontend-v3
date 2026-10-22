/** @jest-environment node */
/**
 * lib/chat/filmVoiceover — the spoken track is Google Cloud TTS and NOTHING else (MASTER TASK v3.1, PR 5d), and the
 * voice check listens with Gemini on Vertex, not ElevenLabs Scribe (PR 5e).
 *
 * ⚠️ PROJECT_MASTER R7 (no silent fallback): a request uses ONE engine. A Cloud TTS miss is `null` — each caller's own
 * no-voice path — and neither ElevenLabs (reached through global fetch, which answers audio here) nor Azure (mocked to
 * SUCCEED) is asked, whatever keys are set, so a fallback put back would surface at once as a hosted URL. Every
 * provider and storage call is mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../veo/policy', () => ({ isGoogleOnly: jest.fn(() => true) }));
jest.mock('../audio/google-tts', () => ({
  ...jest.requireActual('../audio/google-tts'),
  synthesizeGoogleTts: jest.fn(async () => new ArrayBuffer(4096)),
}));
jest.mock('../audio/azure-tts', () => ({
  azureTtsConfigured: jest.fn(() => true),
  synthesizeAzureGeorgian: jest.fn(async () => new ArrayBuffer(4096)),
}));
jest.mock('../orchestrator/storage-adapter', () => ({
  uploadAndSign: jest.fn(async () => 'https://storage.example/tts.mp3'),
  uploadBufferAndSign: jest.fn(async () => 'https://storage.example/voiceover.mp3'),
}));
jest.mock('../voice-v2v/geminiStt', () => ({ transcribeWithGeminiDetailed: jest.fn() }));

import { generateCheckedFilmVoiceover, generateDialogueVoiceover, textToHostedSpeech } from './filmVoiceover';
import { synthesizeGoogleTts } from '../audio/google-tts';
import { synthesizeAzureGeorgian } from '../audio/azure-tts';
import { uploadAndSign } from '../orchestrator/storage-adapter';
import { transcribeWithGeminiDetailed } from '../voice-v2v/geminiStt';

const google = synthesizeGoogleTts as jest.MockedFunction<typeof synthesizeGoogleTts>;
const heard = transcribeWithGeminiDetailed as jest.MockedFunction<typeof transcribeWithGeminiDetailed>;
const KA = 'გამარჯობა, ეს არის ტესტი.';
const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  google.mockResolvedValue(new ArrayBuffer(4096));
  // An ElevenLabs key that would work: the voice must not reach for it.
  process.env = { ...ENV, ELEVENLABS_API_KEY: 'el-test-key', ELEVENLABS_VOICE_ID: 'voiceKaTest01' };
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(4096), { status: 200 }));
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

const noOtherProvider = () => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(synthesizeAzureGeorgian).not.toHaveBeenCalled();
};

test('Cloud TTS speaks the line in its language and it is hosted', async () => {
  expect(await textToHostedSpeech(KA)).toBe('https://storage.example/tts.mp3');
  expect(google).toHaveBeenCalledTimes(1);
  expect(google.mock.calls[0]![0]).toBe(KA);
  expect(google.mock.calls[0]![1]).toMatchObject({ languageCode: 'ka-GE' });
  noOtherProvider();
});

test('a gender the caller names is the voice’s gender', async () => {
  await textToHostedSpeech(KA, 'female');
  await textToHostedSpeech('A plain English line for the dub.', 'male');
  expect(google.mock.calls.map((c) => [c[1]?.languageCode, c[1]?.gender])).toEqual([['ka-GE', 'FEMALE'], ['en-US', 'MALE']]);
});

test('a Cloud TTS miss → null, nothing hosted, and no other engine is asked', async () => {
  google.mockResolvedValue(null);
  expect(await textToHostedSpeech(KA, 'male')).toBeNull();
  noOtherProvider();
  expect(uploadAndSign).not.toHaveBeenCalled();
});

test('a body too short to be audio → null, nothing hosted', async () => {
  google.mockResolvedValue(new ArrayBuffer(200));
  expect(await textToHostedSpeech(KA)).toBeNull();
  expect(uploadAndSign).not.toHaveBeenCalled();
});

test('dialogue: each speaker keeps one voice, and two women of the cast get different ones', async () => {
  const url = await generateDialogueVoiceover({
    compositeId: 'c1',
    turns: [
      { speaker: 'NINO', text: 'სად იყავი?' },
      { speaker: 'SOLDIER', text: 'გზაზე.' },
      { speaker: 'TAMAR', text: 'ჩვენ გელოდით.' },
      { speaker: 'NINO', text: 'დიდხანს.' },
    ],
  });
  expect(url).toBe('https://storage.example/tts.mp3');
  expect(google.mock.calls.map((c) => [c[0], c[1]?.gender, c[1]?.variant])).toEqual([
    ['სად იყავი?', 'FEMALE', 0],
    ['გზაზე.', 'MALE', 0],
    ['ჩვენ გელოდით.', 'FEMALE', 1],
    ['დიდხანს.', 'FEMALE', 0],
  ]);
  noOtherProvider();
});

describe('the voice check listens with Gemini on Vertex (MASTER TASK v3.1 PR 5e): no Scribe, no word timings', () => {
  const opts = { brief: 'a quiet morning in Tbilisi', totalSec: 16, compositeId: 'c1', narrationScript: KA };

  test('Gemini hears the read in Georgian, a read that says its words is hosted with its score, and nothing is timed for subtitles', async () => {
    heard.mockResolvedValue({ text: KA, model: 'gemini-3.8-flash' });
    const out = await generateCheckedFilmVoiceover(opts);
    expect(out).toEqual({ url: 'https://storage.example/voiceover.mp3', score: 1, verdict: 'pass', reads: 1, words: null });
    expect(heard).toHaveBeenCalledTimes(1);
    const [base64, mime, language, o] = heard.mock.calls[0]!;
    expect(Buffer.from(base64, 'base64').byteLength).toBe(4096);
    expect([mime, language, o]).toEqual(['audio/mpeg', 'ka-GE', { timeoutMs: 30_000 }]);
    noOtherProvider();
  });

  test('a read Gemini hears without its words is read once more and the better read is kept', async () => {
    heard.mockResolvedValueOnce({ text: 'სხვა რამე', model: 'gemini-3.8-flash' }).mockResolvedValueOnce({ text: KA, model: 'gemini-3.8-flash' });
    const out = await generateCheckedFilmVoiceover(opts);
    expect(out).toMatchObject({ verdict: 'pass', reads: 2, words: null });
    expect(google).toHaveBeenCalledTimes(2);
    noOtherProvider();
  });

  test('Gemini not answering leaves the voice unverified: hosted, no score, and no other listener is asked', async () => {
    heard.mockRejectedValue(new Error('auth'));
    const out = await generateCheckedFilmVoiceover(opts);
    expect(out).toEqual({ url: 'https://storage.example/voiceover.mp3', score: null, verdict: null, reads: 1, words: null });
    noOtherProvider();
  });

  test('a non-Georgian narration gives Gemini no language hint', async () => {
    heard.mockResolvedValue({ text: 'A plain English line for the film.', model: 'gemini-3.8-flash' });
    await generateCheckedFilmVoiceover({ ...opts, narrationScript: 'A plain English line for the film.' });
    expect(heard.mock.calls[0]![2]).toBe('');
  });
});
