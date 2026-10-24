/** @jest-environment jsdom */
import { PREMIUM_OWNER, speakPremium, stopPremium } from './premium-tts';
import { speechPlayer } from '@/lib/speech/player';
import { wrapPcm16 } from '@/lib/speech/wav';
import { pcm16Tone } from '../../tests/fixtures/speechAudio';

// jsdom has no media playback and no object URLs: they are mocked. A speechSynthesis spy PROVES the premium path never
// falls back to the browser's robot voice.
const WAV = wrapPcm16(pcm16Tone({ channels: 1, frames: 2400 }), { sampleRate: 24000, channels: 1 });
let playMock: jest.Mock;
let speakSpy: jest.Mock;
let fetchMock: jest.Mock;
let urls = 0;
const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;

const answer = (ok = true) => ({ ok, status: ok ? 200 : 503, blob: async () => new Blob([ok ? WAV : 'overloaded']) });
const bodies = () => fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)) as { text: string; locale: string });
const tick = () => new Promise<void>((r) => setTimeout(r, 1));
async function until(cond: () => boolean, label: string) {
  for (let i = 0; i < 300; i++) { if (cond()) return; await tick(); }
  throw new Error(`timed out waiting for ${label}`);
}

beforeEach(() => {
  playMock = jest.fn(() => Promise.resolve());
  const proto = window.HTMLMediaElement.prototype as unknown as Record<string, unknown>;
  proto.play = playMock;
  proto.pause = jest.fn();
  proto.load = jest.fn();
  URL.createObjectURL = jest.fn(() => `blob:${++urls}`);
  URL.revokeObjectURL = jest.fn();
  speakSpy = jest.fn();
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = { speak: speakSpy, cancel: jest.fn() };
  fetchMock = jest.fn(async () => answer());
  (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});

afterEach(() => {
  speechPlayer().stop();
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
  delete (globalThis as unknown as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

/** The page's <audio>: the element play() was last called on. */
const element = () => playMock.mock.contexts.at(-1) as HTMLMediaElement | undefined;
const playingBlob = () => !!element()?.src.startsWith('blob:') && speechPlayer().getState().status === 'playing';

describe('speakPremium', () => {
  test('reads through /api/tts/gemini on the shared player, with the session cookie — NEVER browser speech', async () => {
    speakPremium('გამარჯობა', 'ka');
    await until(playingBlob, 'playing');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/tts/gemini');
    expect((fetchMock.mock.calls[0]![1] as RequestInit).credentials).toBe('include');
    expect(bodies()[0]).toEqual({ text: 'გამარჯობა', locale: 'ka' });
    expect(speechPlayer().getState()).toMatchObject({ owner: PREMIUM_OWNER, status: 'playing' });
    expect(speakSpy).not.toHaveBeenCalled(); // the core guarantee
  });

  test('the WHOLE reply is read, in order — not the first 800 characters', async () => {
    const sentence = (n: number) => `This is sentence number ${n} of a long reply, and it carries a few more words.`;
    const text = Array.from({ length: 24 }, (_, n) => sentence(n + 1)).join(' ');
    expect(text.length).toBeGreaterThan(1500);
    speakPremium(text, 'en');
    for (let guard = 0; guard < 20 && speechPlayer().getState().status !== 'done'; guard++) {
      await until(() => playingBlob() || speechPlayer().getState().status === 'done', 'next chunk');
      if (speechPlayer().getState().status === 'done') break;
      const at = speechPlayer().getState().index;
      element()!.dispatchEvent(new Event('ended'));
      await until(() => speechPlayer().getState().index !== at || speechPlayer().getState().status === 'done', 'advance');
    }
    expect(speechPlayer().getState().status).toBe('done');
    expect(bodies().map((b) => b.text).join(' ')).toBe(text);
    expect(bodies().every((b) => b.text.length <= 600)).toBe(true);
  });

  test('a failed synthesis stops the read as failed — no playback, no robot fallback', async () => {
    fetchMock.mockImplementation(async () => answer(false));
    speakPremium('hi there', 'en');
    await until(() => speechPlayer().getState().status === 'failed', 'failed');
    expect(speechPlayer().getState()).toMatchObject({ owner: PREMIUM_OWNER, fault: 'synthesis', index: 0 });
    expect(playMock).toHaveBeenCalledTimes(1); // the silent unlock only
    expect(speakSpy).not.toHaveBeenCalled();
  });

  test('empty text → no request', () => {
    speakPremium('   ');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('defaults locale to ka', async () => {
    speakPremium('გამარჯობა');
    await until(() => fetchMock.mock.calls.length === 1, 'request');
    expect(bodies()[0]!.locale).toBe('ka');
  });

  test('a new read replaces the previous one; a late answer for the old one never plays', async () => {
    const resolves: Array<(v: unknown) => void> = [];
    fetchMock.mockImplementation(() => new Promise((r) => resolves.push(r)));
    speakPremium('old answer', 'ka');
    speakPremium('latest answer', 'ka');
    const inits = fetchMock.mock.calls.map((c) => c[1] as RequestInit);
    expect((inits[0]!.signal as AbortSignal).aborted).toBe(true);
    resolves[1]!(answer());
    resolves[0]!(answer());
    await until(playingBlob, 'latest playing');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('stopPremium', () => {
  test('stops a premium read and cancels its request', async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockImplementation(() => new Promise((r) => { resolve = r; }));
    speakPremium('old answer');
    stopPremium();
    expect(((fetchMock.mock.calls[0]![1] as RequestInit).signal as AbortSignal).aborted).toBe(true);
    resolve(answer());
    await tick();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(speechPlayer().getState().status).toBe('idle');
  });

  test('leaves a read another button started alone', () => {
    speechPlayer().play({ owner: 'omni:3', text: 'Someone else is reading.', locale: 'en' });
    stopPremium();
    expect(speechPlayer().getState().owner).toBe('omni:3');
  });

  test('is safe to call with nothing playing', () => {
    expect(() => stopPremium()).not.toThrow();
  });
});
