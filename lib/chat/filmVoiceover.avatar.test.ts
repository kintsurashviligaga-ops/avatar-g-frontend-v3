/** @jest-environment node */
/**
 * speakAvatarLine — the talking avatar's line: ONE Cloud TTS read in the chosen gender's voice (MASTER TASK v3.1 PR 5d;
 * it was ElevenLabs' cloned Georgian voice), hosted at the fixed path it is given, with how long it plays (the route
 * refuses a line longer than the clip before it charges). Cloud TTS is mocked; global fetch answers audio, so any call
 * to another engine shows up. Storage is mocked too.
 */
jest.mock('server-only', () => ({}));
jest.mock('../ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../veo/policy', () => ({ isGoogleOnly: jest.fn(() => true) }));
jest.mock('../orchestrator/storage-adapter', () => ({
  uploadAndSign: jest.fn(async () => null),
  uploadBufferAndSign: jest.fn(async () => 'https://storage.example/avatar-veo/id/voice.mp3'),
}));
jest.mock('../audio/google-tts', () => ({
  ...jest.requireActual('../audio/google-tts'),
  synthesizeGoogleTts: jest.fn(),
}));

import { speakAvatarLine } from './filmVoiceover';
import { uploadBufferAndSign } from '../orchestrator/storage-adapter';
import { synthesizeGoogleTts, type GoogleTtsOptions } from '../audio/google-tts';

const google = synthesizeGoogleTts as jest.MockedFunction<typeof synthesizeGoogleTts>;

/** `n` MPEG-1 layer III frames at 128 kbps / 44.1 kHz: n × 26.1 ms. */
function mp3(n: number): ArrayBuffer {
  const len = Math.floor(144 * 128_000 / 44_100);
  const out = new Uint8Array(n * len);
  for (let f = 0; f < n; f++) out.set([0xff, 0xfb, 0x90, 0x00], f * len);
  return out.buffer;
}
/** Cloud TTS refusing with each `status` (0 = no answer), as the module reports it, then answering null. */
const refuses = (...statuses: number[]) => async (_text: string, opts?: GoogleTtsOptions) => {
  for (const s of statuses) opts?.onRefusal?.(s);
  return null;
};
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  google.mockResolvedValue(mp3(115)); // ≈ 3.0 s
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(4096), { status: 200 }));
});
afterEach(() => { fetchSpy.mockRestore(); });

test('the line in the male voice for its language, hosted at the path given, with its length', async () => {
  const r = await speakAvatarLine({ text: 'გადადი მაი ავატარ ჯიზე და დაიწყე', gender: 'male', path: 'avatar-veo/id/voice.mp3' });
  if (!r || !('url' in r)) throw new Error('no line');
  expect(r.url).toBe('https://storage.example/avatar-veo/id/voice.mp3');
  expect(r.seconds).toBeCloseTo(115 * 1152 / 44_100, 3);
  expect(google).toHaveBeenCalledTimes(1);
  expect(google.mock.calls[0]![0]).toBe('გადადი მაი ავატარ ჯიზე და დაიწყე');
  expect(google.mock.calls[0]![1]).toMatchObject({ languageCode: 'ka-GE', gender: 'MALE' });
  expect((uploadBufferAndSign as jest.Mock).mock.calls[0]!.slice(0, 2)).toEqual(['renders', 'avatar-veo/id/voice.mp3']);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('the female voice when she is chosen', async () => {
  await speakAvatarLine({ text: 'გამარჯობა', gender: 'female', path: 'p.mp3' });
  expect(google.mock.calls[0]![1]).toMatchObject({ gender: 'FEMALE' });
});

test('an outage, or a body that is not audio, is null — nothing hosted', async () => {
  google.mockImplementation(refuses(503));
  expect(await speakAvatarLine({ text: 'გამარჯობა', gender: 'male', path: 'p.mp3' })).toBeNull();
  google.mockResolvedValue(new Uint8Array(4096).buffer);
  expect(await speakAvatarLine({ text: 'გამარჯობა', gender: 'male', path: 'p.mp3' })).toBeNull();
  expect(uploadBufferAndSign).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a refusal a retry cannot change (the API off on the project, the service account not allowed) is "off" — nothing hosted', async () => {
  google.mockImplementation(refuses(403));
  expect(await speakAvatarLine({ text: 'გადადი მაი ავატარ ჯიზე და დაიწყე', gender: 'female', path: 'p.mp3' })).toEqual({ off: true });
  expect(uploadBufferAndSign).not.toHaveBeenCalled();
});

test('a lasting refusal next to no answer at all stays a passing miss', async () => {
  google.mockImplementation(refuses(403, 0));
  expect(await speakAvatarLine({ text: 'გამარჯობა', gender: 'male', path: 'p.mp3' })).toBeNull();
});

test('no Cloud TTS config: no refusal was heard, so it is a passing miss, not "off"', async () => {
  google.mockResolvedValue(null);
  expect(await speakAvatarLine({ text: 'გამარჯობა', gender: 'male', path: 'p.mp3' })).toBeNull();
});
