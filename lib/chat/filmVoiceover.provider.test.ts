/** @jest-environment node */
/**
 * lib/chat/filmVoiceover — the spoken track is ElevenLabs and NOTHING else.
 *
 * ⚠️ PROJECT_MASTER R7 (no silent fallback): when ElevenLabs was absent or down, synthesis fell to Azure's native ka
 * voices for Georgian and then to Google Cloud TTS, so a film, a dub or an avatar line could be voiced by another
 * provider's voice than the one the user cast. A request uses ONE provider now: an ElevenLabs miss is `null` — each
 * caller's own no-voice path. The Azure and Google modules are mocked to SUCCEED here, so a fallback put back would
 * surface at once as a hosted URL. Every provider and storage call is mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../veo/policy', () => ({ isGoogleOnly: jest.fn(() => true) }));
jest.mock('../audio/google-tts', () => ({
  synthesizeGoogleTts: jest.fn(async () => new ArrayBuffer(4096)),
  genderForPersona: jest.fn(() => 'FEMALE'),
}));
jest.mock('../audio/azure-tts', () => ({
  azureTtsConfigured: jest.fn(() => true),
  synthesizeAzureGeorgian: jest.fn(async () => new ArrayBuffer(4096)),
}));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://storage.example/tts.mp3') }));
jest.mock('../elevenlabs/concurrency', () => ({ withElevenLabsSlot: jest.fn(<T,>(fn: () => Promise<T>) => fn()) }));

import { SFX_TEXT_MAX, elevenLabsRefusal, generateFilmSfx, sfxPromptText, textToHostedSpeech } from './filmVoiceover';
import { synthesizeGoogleTts } from '../audio/google-tts';
import { synthesizeAzureGeorgian } from '../audio/azure-tts';
import { uploadAndSign } from '../orchestrator/storage-adapter';

const KA = 'გამარჯობა, ეს არის ტესტი.';
const VOICE = 'voiceKaTest01';
const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, ELEVENLABS_API_KEY: 'el-test-key' };
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(4096), { status: 200 }));
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

const noOtherProvider = () => {
  expect(synthesizeAzureGeorgian).not.toHaveBeenCalled();
  expect(synthesizeGoogleTts).not.toHaveBeenCalled();
};

test('ElevenLabs speaks the line (the baseline) and it is hosted', async () => {
  expect(await textToHostedSpeech(KA, VOICE)).toBe('https://storage.example/tts.mp3');
  expect(String(fetchSpy.mock.calls[0][0])).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`);
  noOtherProvider();
});

test('ElevenLabs answers an error on every model → null; Azure and Google are never asked', async () => {
  fetchSpy.mockResolvedValue(new Response('quota exceeded', { status: 429 }));
  expect(await textToHostedSpeech(KA, VOICE)).toBeNull();
  // eleven_v3 → eleven_multilingual_v2 is a retry on the SAME provider, and the only one.
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  for (const [url] of fetchSpy.mock.calls) expect(String(url)).toMatch(/^https:\/\/api\.elevenlabs\.io\//);
  noOtherProvider();
  expect(uploadAndSign).not.toHaveBeenCalled();
});

test('ElevenLabs throws (network) → null, no other provider', async () => {
  fetchSpy.mockRejectedValue(new Error('ECONNRESET'));
  expect(await textToHostedSpeech('A plain English line for the dub.', VOICE)).toBeNull();
  noOtherProvider();
});

test('no ElevenLabs key → null, without a call to anyone', async () => {
  delete process.env.ELEVENLABS_API_KEY;
  expect(await textToHostedSpeech(KA, VOICE)).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
  noOtherProvider();
});

test('a voice override that is not a voice id → null, and nothing is fetched (it would sit in the provider URL path)', async () => {
  expect(await textToHostedSpeech(KA, '../voices/someone/settings/edit?x=')).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
  noOtherProvider();
  expect(uploadAndSign).not.toHaveBeenCalled();
});

describe('a refusal is named in the log, never silent', () => {
  // ⚠️ 2026-10-17: a paid film's voice and sound effects both came back null with nothing in the logs. The cause (the key's
  // ID set where the key belongs) surfaced only in the Music leg's warning.
  const refusal = JSON.stringify({ detail: { type: 'authentication_error', code: 'invalid_api_key', message: 'API key ID used as API key', status: 'api_key_id_used_as_api_key' } });

  test('the voice: status and ElevenLabs’ own code, for each model tried, and never the key', async () => {
    fetchSpy.mockImplementation(async () => new Response(refusal, { status: 400 }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await textToHostedSpeech(KA, VOICE)).toBeNull();
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines).toEqual([
      '[tts] ElevenLabs eleven_v3 refused: 400 invalid_api_key / api_key_id_used_as_api_key',
      '[tts] ElevenLabs eleven_multilingual_v2 refused: 400 invalid_api_key / api_key_id_used_as_api_key',
    ]);
    expect(lines.join('\n')).not.toContain('el-test-key');
    warn.mockRestore();
  });

  test('the sound effects: the same', async () => {
    fetchSpy.mockImplementation(async () => new Response(refusal, { status: 400 }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await generateFilmSfx({ brief: 'rain on a pier', totalSec: 24, compositeId: 'c1' })).toBeNull();
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual(['[sfx] ElevenLabs sound generation refused: 400 invalid_api_key / api_key_id_used_as_api_key']);
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
