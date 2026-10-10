/** @jest-environment node */
/**
 * lib/voice-v2v/providers under AI_GOOGLE_ONLY (on by default): ElevenLabs is the one allowed voice engine, so a TTS
 * miss is an ElevenLabs failure, never a silent Cartesia answer; and the realtime STT, whose engines are OpenAI and
 * Deepgram only, refuses instead of sending the audio to either. With the switch off both keep their old cascades.
 */
jest.mock('server-only', () => ({}));

import { synthesizeSpeechChunk, transcribeRealtimePcmChunk } from './providers';

const KEYS = ['AI_GOOGLE_ONLY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'CARTESIA_API_KEY', 'CARTESIA_VOICE_ID', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY'];
const saved: Record<string, string | undefined> = {};
let fetchSpy: jest.SpyInstance;
const hosts = () => fetchSpy.mock.calls.map((c) => new URL(String(c[0])).host);

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.ELEVENLABS_API_KEY = 'el-test';
  process.env.ELEVENLABS_VOICE_ID = 'voice-test';
  process.env.CARTESIA_API_KEY = 'ca-test';
  process.env.CARTESIA_VOICE_ID = 'ca-voice';
  process.env.OPENAI_API_KEY = 'oa-test';
  process.env.DEEPGRAM_API_KEY = 'dg-test';
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
});
afterEach(() => {
  fetchSpy.mockRestore();
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe('switch on (the default)', () => {
  test('an ElevenLabs miss is an ElevenLabs failure: Cartesia is never called', async () => {
    await expect(synthesizeSpeechChunk({ text: 'გამარჯობა', language: 'ka-GE' })).rejects.toThrow(/elevenlabs/);
    expect(hosts()).toEqual(['api.elevenlabs.io']);
  });

  test('the realtime STT refuses before any audio leaves', async () => {
    await expect(transcribeRealtimePcmChunk({ audioBase64: 'AAAA', language: 'ka-GE' })).rejects.toThrow(/google_only/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('switch off', () => {
  beforeEach(() => { process.env.AI_GOOGLE_ONLY = '0'; });

  test('the TTS cascade still falls back to Cartesia', async () => {
    await expect(synthesizeSpeechChunk({ text: 'hello', language: 'en-US' })).rejects.toThrow();
    expect(hosts()).toEqual(['api.elevenlabs.io', 'api.cartesia.ai']);
  });
});
