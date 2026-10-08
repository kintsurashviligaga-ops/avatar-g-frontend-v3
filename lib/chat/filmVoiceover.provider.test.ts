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

import { textToHostedSpeech } from './filmVoiceover';
import { synthesizeGoogleTts } from '../audio/google-tts';
import { synthesizeAzureGeorgian } from '../audio/azure-tts';
import { uploadAndSign } from '../orchestrator/storage-adapter';

const KA = 'გამარჯობა, ეს არის ტესტი.';
const VOICE = 'voice-ka-test';
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
