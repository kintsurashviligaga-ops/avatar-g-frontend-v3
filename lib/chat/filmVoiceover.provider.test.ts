/** @jest-environment node */
/**
 * lib/chat/filmVoiceover — the spoken track is Google Cloud TTS and NOTHING else (MASTER TASK v3.1, PR 5d).
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
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://storage.example/tts.mp3') }));

import { SFX_TEXT_MAX, elevenLabsRefusal, generateDialogueVoiceover, generateFilmSfx, sfxPromptText, textToHostedSpeech } from './filmVoiceover';
import { synthesizeGoogleTts } from '../audio/google-tts';
import { synthesizeAzureGeorgian } from '../audio/azure-tts';
import { uploadAndSign } from '../orchestrator/storage-adapter';

const google = synthesizeGoogleTts as jest.MockedFunction<typeof synthesizeGoogleTts>;
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

describe('the sound effects (still ElevenLabs until PR 5e): a refusal is named in the log, never silent', () => {
  // ⚠️ 2026-10-17: a paid film's voice and sound effects both came back null with nothing in the logs. The cause (the key's
  // ID set where the key belongs) surfaced only in the Music leg's warning.
  const refusal = JSON.stringify({ detail: { type: 'authentication_error', code: 'invalid_api_key', message: 'API key ID used as API key', status: 'api_key_id_used_as_api_key' } });

  test('status and ElevenLabs’ own code, never the key', async () => {
    fetchSpy.mockImplementation(async () => new Response(refusal, { status: 400 }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await generateFilmSfx({ brief: 'rain on a pier', totalSec: 24, compositeId: 'c1' })).toBeNull();
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines).toEqual(['[sfx] ElevenLabs sound generation refused: 400 invalid_api_key / api_key_id_used_as_api_key']);
    expect(lines.join('\n')).not.toContain('el-test-key');
    warn.mockRestore();
  });

  test('the sound-effects prompt stays within ElevenLabs’ 450 characters, whatever the brief (live E2E: 400 text_too_long)', async () => {
    const long = 'Waves breaking on the Batumi promenade at dusk, gulls, a distant ferry horn, wind in the palms, footsteps on wet stone, '.repeat(4);
    await generateFilmSfx({ brief: long, totalSec: 16, compositeId: 'c1' });
    const sent = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body)) as { text: string };
    expect(sent.text.length).toBeLessThanOrEqual(SFX_TEXT_MAX);
    expect(sent.text).toMatch(/^Cinematic, immersive sound design and ambience for this film scene: Waves breaking/);
    expect(sent.text).toMatch(/No music, no melody, no speech\.$/);
    // The old 280-character cut sent 461.
    expect(`Cinematic, immersive sound design and ambience for this film scene: ${long.slice(0, 280)}. Layered environmental sound effects and foley that fit the location and action. No music, no melody, no speech.`.length).toBeGreaterThan(SFX_TEXT_MAX);
    // A short brief reads exactly as before.
    expect(sfxPromptText('rain on a pier')).toBe('Cinematic, immersive sound design and ambience for this film scene: rain on a pier. Layered environmental sound effects and foley that fit the location and action. No music, no melody, no speech.');
  });

  test('a body that is not ElevenLabs’ JSON, or a code that is not a plain token, logs the status alone', async () => {
    expect(await elevenLabsRefusal(new Response('<html>bad gateway</html>', { status: 502 }))).toBe('502');
    expect(await elevenLabsRefusal(new Response(JSON.stringify({ detail: { status: 'sk_live secret here' } }), { status: 401 }))).toBe('401');
    expect(await elevenLabsRefusal(new Response(JSON.stringify({ detail: 'quota' }), { status: 429 }))).toBe('429');
  });
});
