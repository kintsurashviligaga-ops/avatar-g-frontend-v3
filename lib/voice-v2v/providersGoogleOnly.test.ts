/** @jest-environment node */
/**
 * lib/voice-v2v/providers is Google-only whatever the env says (MASTER TASK v3.1): the TTS is Google Cloud TTS
 * (lib/audio/google-tts, PR 5d), so a TTS miss is a Cloud TTS failure, never a silent ElevenLabs or Cartesia answer; and
 * the realtime STT, whose engines were OpenAI and Deepgram only, refuses instead of sending the audio to either. No
 * switch, provider env or key brings them back: global fetch answers audio for anyone who calls it, and nobody may.
 */
jest.mock('server-only', () => ({}));
jest.mock('../audio/google-tts', () => ({ synthesizeGoogleTts: jest.fn(async () => new Uint8Array(2048).fill(9).buffer) }));

import { getRealtimeProviderSnapshot, synthesizeSpeechChunk, transcribeRealtimePcmChunk } from './providers';
import { synthesizeGoogleTts } from '../audio/google-tts';

const google = synthesizeGoogleTts as jest.MockedFunction<typeof synthesizeGoogleTts>;
const KEYS = ['AI_GOOGLE_ONLY', 'OUTSIDE_ENGINES_APPROVED', 'VOICE_V2V_TTS_PROVIDER', 'VOICE_V2V_STT_PROVIDER', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'CARTESIA_API_KEY', 'CARTESIA_VOICE_ID', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY'];
const saved: Record<string, string | undefined> = {};
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.ELEVENLABS_API_KEY = 'el-test';
  process.env.ELEVENLABS_VOICE_ID = 'voice-test';
  process.env.CARTESIA_API_KEY = 'ca-test';
  process.env.CARTESIA_VOICE_ID = 'ca-voice';
  process.env.OPENAI_API_KEY = 'oa-test';
  process.env.DEEPGRAM_API_KEY = 'dg-test';
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(4096), { status: 200 }));
});
afterEach(() => {
  fetchSpy.mockRestore();
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe.each([
  {},
  { AI_GOOGLE_ONLY: '0' },
  { AI_GOOGLE_ONLY: 'off', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-cartesia', VOICE_V2V_TTS_PROVIDER: 'cartesia', VOICE_V2V_STT_PROVIDER: 'deepgram' },
])('whatever the env says (%o)', (env) => {
  beforeEach(() => { Object.assign(process.env, env); });

  test('Cloud TTS speaks the chunk in its language', async () => {
    const out = await synthesizeSpeechChunk({ text: '  გამარჯობა  ', language: 'ka-GE' });
    expect(out).toEqual({ audioBase64: Buffer.alloc(2048, 9).toString('base64'), mimeType: 'audio/mpeg', provider: 'google-cloud-tts' });
    expect(google).toHaveBeenCalledWith('გამარჯობა', { languageCode: 'ka-GE' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getRealtimeProviderSnapshot().tts).toBe('google-cloud-tts');
  });

  test('a Cloud TTS miss is a Cloud TTS failure: ElevenLabs and Cartesia are never called', async () => {
    google.mockResolvedValueOnce(null);
    await expect(synthesizeSpeechChunk({ text: 'hello', language: 'en-US' })).rejects.toThrow('google_tts_failed');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('the realtime STT refuses before any audio leaves', async () => {
    await expect(transcribeRealtimePcmChunk({ audioBase64: 'AAAA', language: 'ka-GE' })).rejects.toThrow(/google_only/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
