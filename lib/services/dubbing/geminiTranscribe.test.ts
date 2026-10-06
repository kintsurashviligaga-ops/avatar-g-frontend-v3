/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('../../ai/google/transport', () => ({ googleAiConfigured: jest.fn(() => true), googleModelFetch: jest.fn() }));
import { googleAiConfigured, googleModelFetch } from '../../ai/google/transport';
import { parseTimedTranscript, transcribeTimedAudio } from './geminiTranscribe';
const valid = { languageCode: 'ka', segments: [{ startSec: 0, endSec: 1.5, text: 'გამარჯობა', speaker: 'speaker_1' }] };
afterEach(() => jest.clearAllMocks());
test('retains original script and measured segment times', () => {
  expect(parseTimedTranscript(valid, 2)).toEqual({ text: 'გამარჯობა', segments: valid.segments, detectedLanguage: 'ka' });
});
test.each([NaN, -1, 0, 16, 500])('rejects invalid/out-of-source end time %s', endSec => {
  expect(parseTimedTranscript({ ...valid, segments: [{ ...valid.segments[0], endSec }] }, 2)).toBeNull();
});
test('rejects out of order or absent timing', () => {
  expect(parseTimedTranscript({ segments: [{ startSec: 2, endSec: 3, text: 'a' }, { startSec: 0, endSec: 1, text: 'b' }] })).toBeNull();
  expect(parseTimedTranscript({ segments: [{ text: 'a' }] })).toBeNull();
});
test('one Google request, original MP3 bytes, no fallback after an incomplete transcript', async () => {
  jest.mocked(googleModelFetch).mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(valid) }] } }] })));
  await expect(transcribeTimedAudio(Buffer.from('audio'), { durationSec: 2 })).resolves.toBeNull();
  expect(googleModelFetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(jest.mocked(googleModelFetch).mock.calls[0][2].body)).contents[0].parts[0].inlineData).toEqual({ mimeType: 'audio/mp3', data: Buffer.from('audio').toString('base64') });
});
test('unconfigured transport performs no call', async () => {
  jest.mocked(googleAiConfigured).mockReturnValueOnce(false);
  await expect(transcribeTimedAudio(Buffer.from('audio'))).resolves.toBeNull();
  expect(googleModelFetch).not.toHaveBeenCalled();
});
