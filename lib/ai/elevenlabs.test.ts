/** @jest-environment node */
/**
 * lib/ai/elevenlabs generateVoice — the voice id is request input (orbit voice-synthesis, Voice Lab jobs) and goes into
 * the ElevenLabs URL path with the platform key, so a malformed one is refused before any fetch.
 */
import { generateVoice } from './elevenlabs';

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  process.env = { ...ENV, ELEVENLABS_API_KEY: 'el-test-key' };
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(2048), { status: 200 }));
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

test('a well-formed id is synthesized at /v1/text-to-speech/<id>', async () => {
  const out = await generateVoice('hello there', '21m00Tcm4TlvDq8ikWAM');
  expect(String(fetchSpy.mock.calls[0][0])).toBe('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM');
  expect(out.voiceId).toBe('21m00Tcm4TlvDq8ikWAM');
});

test.each(['../voices/abc/settings/edit?x=', 'abc#x', 'abc/stream', ''])('refuses %p without a fetch', async (id) => {
  await expect(generateVoice('hello there', id)).rejects.toThrow('invalid voice id');
  expect(fetchSpy).not.toHaveBeenCalled();
});
