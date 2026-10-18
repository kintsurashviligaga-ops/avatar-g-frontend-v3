/** @jest-environment node */
/**
 * speakAvatarLine — the talking avatar's Georgian line (GG's tap 2026-10-17 07:54Z „ElevenLabs ხმა"): ONE ElevenLabs
 * request in the chosen gender's cloned Georgian voice, hosted at the fixed path it is given, with how long it plays (the
 * route refuses a line longer than the clip before it charges). Every provider and storage call is mocked.
 */
jest.mock('server-only', () => ({}));
jest.mock('../ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../veo/policy', () => ({ isGoogleOnly: jest.fn(() => true) }));
jest.mock('../orchestrator/storage-adapter', () => ({
  uploadAndSign: jest.fn(async () => null),
  uploadBufferAndSign: jest.fn(async () => 'https://storage.example/avatar-veo/id/voice.mp3'),
}));
jest.mock('../elevenlabs/concurrency', () => ({ withElevenLabsSlot: jest.fn(<T,>(fn: () => Promise<T>) => fn()) }));

import { speakAvatarLine } from './filmVoiceover';
import { uploadBufferAndSign } from '../orchestrator/storage-adapter';
import { KA_VOICE_FEMALE, KA_VOICE_MALE } from '../audio/georgian-voice';

/** `n` MPEG-1 layer III frames at 128 kbps / 44.1 kHz: n × 26.1 ms. */
function mp3(n: number): Uint8Array {
  const len = Math.floor(144 * 128_000 / 44_100);
  const out = new Uint8Array(n * len);
  for (let f = 0; f < n; f++) out.set([0xff, 0xfb, 0x90, 0x00], f * len);
  return out;
}
const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, ELEVENLABS_API_KEY: 'el-test-key' };
  delete process.env.ELEVENLABS_VOICE_ID_MALE;
  delete process.env.ELEVENLABS_VOICE_ID_FEMALE;
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(mp3(115), { status: 200 })); // ≈ 3.0 s
});
afterEach(() => { fetchSpy.mockRestore(); process.env = { ...ENV }; });

test('the line in the male Georgian voice, hosted at the path given, with its length', async () => {
  const r = await speakAvatarLine({ text: 'გადადი მაი ავატარ ჯიზე და დაიწყე', gender: 'male', path: 'avatar-veo/id/voice.mp3' });
  if (!r || !('url' in r)) throw new Error('no line');
  expect(r.url).toBe('https://storage.example/avatar-veo/id/voice.mp3');
  expect(r.seconds).toBeCloseTo(115 * 1152 / 44_100, 3);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(String(fetchSpy.mock.calls[0][0])).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${KA_VOICE_MALE}`);
  expect(JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body)).text).toBe('გადადი მაი ავატარ ჯიზე და დაიწყე');
  expect((uploadBufferAndSign as jest.Mock).mock.calls[0]!.slice(0, 2)).toEqual(['renders', 'avatar-veo/id/voice.mp3']);
});

test('the female voice when she is chosen', async () => {
  await speakAvatarLine({ text: 'გამარჯობა', gender: 'female', path: 'p.mp3' });
  expect(String(fetchSpy.mock.calls[0][0])).toContain(KA_VOICE_FEMALE);
});

test('an outage, or a body that is not audio, is null — nothing hosted', async () => {
  fetchSpy.mockImplementation(async () => new Response('{"detail":{"status":"service_unavailable"}}', { status: 503 }));
  expect(await speakAvatarLine({ text: 'გამარჯობა', gender: 'male', path: 'p.mp3' })).toBeNull();
  fetchSpy.mockImplementation(async () => new Response(new Uint8Array(4096), { status: 200 }));
  expect(await speakAvatarLine({ text: 'გამარჯობა', gender: 'male', path: 'p.mp3' })).toBeNull();
  expect(uploadBufferAndSign).not.toHaveBeenCalled();
});

// Production, 2026-10-17 09:31Z, the one approved avatar test: both models answered this, and the user was told to try
// again in a minute. A retry cannot change a plan: the line is off.
const PLAN_REFUSAL = '{"detail":{"status":"ivc_not_permitted","code":"subscription_required","message":"Your subscription does not include instant voice cloning."}}';

test('a plan that does not allow the cloned Georgian voices is "off", not a passing miss — nothing hosted', async () => {
  fetchSpy.mockImplementation(async () => new Response(PLAN_REFUSAL, { status: 401 }));
  expect(await speakAvatarLine({ text: 'გადადი მაი ავატარ ჯიზე და დაიწყე', gender: 'female', path: 'p.mp3' })).toEqual({ off: true });
  expect(fetchSpy).toHaveBeenCalledTimes(2); // eleven_v3, then eleven_multilingual_v2 — both refused
  expect(uploadBufferAndSign).not.toHaveBeenCalled();
});

test('a lasting refusal from one model and no answer from the other stays a passing miss', async () => {
  fetchSpy
    .mockImplementationOnce(async () => new Response(PLAN_REFUSAL, { status: 401 }))
    .mockImplementationOnce(async () => { throw new TypeError('fetch failed'); });
  expect(await speakAvatarLine({ text: 'გამარჯობა', gender: 'male', path: 'p.mp3' })).toBeNull();
});
