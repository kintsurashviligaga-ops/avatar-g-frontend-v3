/** @jest-environment jsdom */
import { speakPremium, stopPremium } from './premium-tts';

// jsdom doesn't implement media playback or object URLs — mock them, and install
// a speechSynthesis spy so we can PROVE the premium path never falls back to the
// browser robot voice.
let playMock: jest.Mock;
let pauseMock: jest.Mock;
let speakSpy: jest.Mock;
const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;

function mockFetch(ok: boolean, size = 128) {
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
    ok,
    blob: async () => new Blob(['x'.repeat(size)], { type: 'audio/wav' }),
  });
}

beforeEach(() => {
  playMock = jest.fn().mockResolvedValue(undefined);
  pauseMock = jest.fn();
  (window.HTMLMediaElement.prototype as unknown as { play: jest.Mock }).play = playMock;
  (window.HTMLMediaElement.prototype as unknown as { pause: jest.Mock }).pause = pauseMock;
  URL.createObjectURL = jest.fn(() => 'blob:mock');
  URL.revokeObjectURL = jest.fn();
  speakSpy = jest.fn();
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = { speak: speakSpy, cancel: jest.fn() };
});

afterEach(() => {
  stopPremium();
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
  delete (globalThis as unknown as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

describe('speakPremium', () => {
  test('routes to /api/tts/gemini with text+locale and plays — NEVER browser speech', async () => {
    mockFetch(true);
    const audio = await speakPremium('გამარჯობა', 'ka');
    const calls = (globalThis as unknown as { fetch: jest.Mock }).fetch.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('/api/tts/gemini');
    expect(JSON.parse(calls[0][1].body)).toMatchObject({ text: 'გამარჯობა', locale: 'ka' });
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(audio).not.toBeNull();
    expect(speakSpy).not.toHaveBeenCalled(); // the core guarantee
  });

  test('non-ok response → null, no playback, no robot fallback', async () => {
    mockFetch(false);
    expect(await speakPremium('hi', 'en')).toBeNull();
    expect(playMock).not.toHaveBeenCalled();
    expect(speakSpy).not.toHaveBeenCalled();
  });

  test('empty text → no fetch, null', async () => {
    mockFetch(true);
    expect(await speakPremium('   ')).toBeNull();
    expect((globalThis as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
  });

  test('play() rejection (autoplay blocked) → null, still no robot fallback', async () => {
    mockFetch(true);
    playMock.mockRejectedValueOnce(new Error('autoplay blocked'));
    expect(await speakPremium('x', 'ka')).toBeNull();
    expect(speakSpy).not.toHaveBeenCalled();
  });

  test('a new play stops the previous track (singleton)', async () => {
    mockFetch(true);
    await speakPremium('one', 'ka');
    await speakPremium('two', 'ka');
    expect(pauseMock).toHaveBeenCalled(); // previous paused on the second call
  });

  test('defaults locale to ka', async () => {
    mockFetch(true);
    await speakPremium('გამარჯობა');
    const init = (globalThis as unknown as { fetch: jest.Mock }).fetch.mock.calls[0][1];
    expect(JSON.parse(init.body).locale).toBe('ka');
  });
});

describe('stopPremium', () => {
  test('pauses current playback + revokes the object URL', async () => {
    mockFetch(true);
    await speakPremium('x', 'ka');
    stopPremium();
    expect(pauseMock).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  test('is safe to call with nothing playing', () => {
    expect(() => stopPremium()).not.toThrow();
  });
});
