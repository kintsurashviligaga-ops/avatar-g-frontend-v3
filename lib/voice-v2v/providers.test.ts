/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('ai', () => ({ streamText: jest.fn() }));
jest.mock('../ai/google/provider', () => ({ createGoogleGenerativeAI: jest.fn(() => (model: string) => model) }));
jest.mock('./geminiStt', () => ({ transcribeWithGeminiDetailed: jest.fn(async () => ({ text: 'hello' })) }));
jest.mock('../services/billing/chatBudget', () => ({ chatBudgetAllows: jest.fn(async () => true), bookChatUsage: jest.fn(async () => undefined) }));
import { streamText } from 'ai';
import { transcribeRealtimePcmChunk, streamAssistantTokens, getRealtimeProviderSnapshot, synthesizeSpeechChunk } from './providers';
import { transcribeWithGeminiDetailed } from './geminiStt';
const env = { ...process.env };
beforeEach(() => { jest.clearAllMocks(); process.env = { ...env }; });
afterEach(() => { process.env = { ...env }; });
test('legacy provider environment cannot select a banned voice provider', () => {
  process.env.VOICE_V2V_STT_PROVIDER = 'deepgram'; process.env.VOICE_V2V_TTS_PROVIDER = 'cartesia';
  expect(getRealtimeProviderSnapshot()).toEqual({ stt: 'gemini', tts: 'elevenlabs-multilingual-v2' });
});
test('raw mono PCM frames become a valid WAV for Gemini', async () => {
  const result = await transcribeRealtimePcmChunk({ audioBase64: Buffer.from([0, 1, 0, 2]).toString('base64'), language: 'en-US', sampleRate: 16000 });
  expect(result.provider).toBe('gemini');
  const [base64, mime] = (transcribeWithGeminiDetailed as jest.Mock).mock.calls[0];
  const bytes = Buffer.from(base64, 'base64');
  expect(mime).toBe('audio/wav'); expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.readUInt32LE(24)).toBe(16000); expect(bytes.readUInt32LE(40)).toBe(4);
});
test('stream errors are surfaced, never replaced with fabricated assistant replies', async () => {
  (streamText as jest.Mock).mockReturnValue({ fullStream: (async function* () { yield { type: 'error', error: new Error('quota') }; })() });
  await expect((async () => { for await (const _ of streamAssistantTokens({ userText: 'hello', language: 'en-US' })) { /* consume */ } })()).rejects.toThrow('voice_provider_unavailable');
});
test('actual text chunks are streamed with a bounded abort signal', async () => {
  (streamText as jest.Mock).mockReturnValue({ fullStream: (async function* () { yield { type: 'text-delta', text: 'Hello' }; })() });
  const output: string[] = [];
  for await (const text of streamAssistantTokens({ userText: 'hello', language: 'en-US' })) output.push(text);
  expect(output).toEqual(['Hello']);
  expect((streamText as jest.Mock).mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal);
});
test('missing ElevenLabs configuration cannot fall through to Cartesia', async () => {
  delete process.env.ELEVENLABS_API_KEY; process.env.CARTESIA_API_KEY = 'retired';
  await expect(synthesizeSpeechChunk({ text: 'hello', language: 'en-US' })).rejects.toThrow('elevenlabs_config_missing');
});
