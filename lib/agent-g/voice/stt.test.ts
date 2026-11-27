/** @jest-environment node */
/**
 * Agent G's Telegram voice notes go to Chirp 3 (lib/voice-v2v/chirpStt), never to OpenAI (v5.1 M-14 cleanup, GG
 * 2026-11-13). Off unless AGENT_G_VOICE=on; a note is capped at Chirp's 60 s sync limit. Chirp and Telegram are mocked.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../voice-v2v/chirpStt', () => ({
  CHIRP_SYNC_MAX_SECONDS: 60,
  transcribeWithChirp: jest.fn(async () => ({ text: ' გამარჯობა ', model: 'chirp_3', billedSeconds: 6, leg: 'georgian' })),
}));

import { agentGVoiceMaxSeconds, isAgentGVoiceEnabled, transcribeAudioBuffer, transcribeTelegramVoice } from './stt';
import { transcribeWithChirp } from '../../voice-v2v/chirpStt';

const chirp = transcribeWithChirp as jest.Mock;
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/getFile')) return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/f.oga' } }), { status: 200 });
    if (url.includes('/file/bot')) return new Response(new Uint8Array([79, 103, 103, 83, 1, 2, 3]), { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
});
afterEach(() => fetchSpy.mockRestore());

test('off unless AGENT_G_VOICE=on', () => {
  expect(isAgentGVoiceEnabled({})).toBe(false);
  expect(isAgentGVoiceEnabled({ AGENT_G_VOICE: 'true' })).toBe(false);
  expect(isAgentGVoiceEnabled({ AGENT_G_VOICE: 'on' })).toBe(true);
  expect(isAgentGVoiceEnabled({ AGENT_G_VOICE: ' ON ' })).toBe(true);
});

test('the length cap never passes Chirp’s 60 s sync limit', () => {
  expect(agentGVoiceMaxSeconds({})).toBe(45);
  expect(agentGVoiceMaxSeconds({ AGENT_G_VOICE_MAX_SECONDS: '30' })).toBe(30);
  expect(agentGVoiceMaxSeconds({ AGENT_G_VOICE_MAX_SECONDS: '300' })).toBe(60);
  expect(agentGVoiceMaxSeconds({ AGENT_G_VOICE_MAX_SECONDS: 'x' })).toBe(45);
});

test('a clip goes to Chirp in Georgian and comes back trimmed', async () => {
  const r = await transcribeAudioBuffer({ audioBuffer: new Uint8Array([1, 2, 3]) });
  expect(chirp).toHaveBeenCalledWith(expect.any(Uint8Array), 'ka');
  expect(r).toEqual({ transcript: 'გამარჯობა', provider: 'chirp-3', billedSeconds: 6 });
});

test('an empty clip or an empty answer is an error, not a blank reply', async () => {
  await expect(transcribeAudioBuffer({ audioBuffer: new Uint8Array() })).rejects.toThrow('empty_voice_file');
  chirp.mockResolvedValueOnce({ text: '  ', model: 'chirp_3', billedSeconds: 1, leg: 'listed' });
  await expect(transcribeAudioBuffer({ audioBuffer: new Uint8Array([1]) })).rejects.toThrow('chirp_transcription_empty');
});

test('a Telegram voice note is downloaded and sent to Chirp; nothing reaches OpenAI', async () => {
  const r = await transcribeTelegramVoice({ botToken: 'T', fileId: 'F', mimeType: 'audio/ogg' });
  expect(r.transcript).toBe('გამარჯობა');
  const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
  expect(urls.some((u) => /openai/i.test(u))).toBe(false);
  expect(chirp).toHaveBeenCalledTimes(1);
});
