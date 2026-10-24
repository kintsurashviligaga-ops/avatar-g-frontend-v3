/** @jest-environment node */
/**
 * lib/speech/request — one POST per chunk, cancelled with its caller, bounded, never retried (§5.3.4).
 */
import { SPEECH_CLIENT_DEADLINE_MS } from './deadline';
import { SPEECH_ROUTE, requestSpeech } from './request';
import { WAV_MONO_24K } from '../../tests/fixtures/speechAudio';

const wav = () => new Response(Buffer.from(WAV_MONO_24K), { status: 200, headers: { 'content-type': 'audio/wav' } });
/** Answers only by rejecting when its signal aborts (at once if it already has, as fetch does). */
const hangs = jest.fn(async (_url: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  }),
);
const initOf = (f: jest.Mock, i = 0) => f.mock.calls[i]![1] as RequestInit;

afterEach(() => { jest.useRealTimers(); hangs.mockClear(); });

test('POSTs the text and locale to the read-aloud route with the session cookie, and hands back the WAV', async () => {
  const f = jest.fn(async () => wav());
  const blob = await requestSpeech('გამარჯობა', 'ka', undefined, f as unknown as typeof fetch);
  expect(blob?.size).toBe(WAV_MONO_24K.length);
  expect(f).toHaveBeenCalledTimes(1);
  expect(f.mock.calls[0]![0]).toBe(SPEECH_ROUTE);
  expect(initOf(f)).toMatchObject({ method: 'POST', credentials: 'include' });
  expect(JSON.parse(String(initOf(f).body))).toEqual({ text: 'გამარჯობა', locale: 'ka' });
});

test.each([
  ['a 503', async () => new Response('overloaded', { status: 503 })],
  ['a 413', async () => new Response('{"error":"text_too_long"}', { status: 413 })],
  ['a network error', async () => { throw new TypeError('fetch failed'); }],
  ['an empty body', async () => new Response(new Uint8Array(0), { status: 200 })],
])('%s is null after ONE request: the route owns the retries', async (_why, impl) => {
  const f = jest.fn(impl);
  expect(await requestSpeech('hello', 'en', undefined, f as unknown as typeof fetch)).toBeNull();
  expect(f).toHaveBeenCalledTimes(1);
});

test('the caller aborting cancels the request in flight (so the route stops too) and answers null', async () => {
  const ctrl = new AbortController();
  const pending = requestSpeech('hello', 'en', ctrl.signal, hangs as unknown as typeof fetch);
  ctrl.abort();
  expect(await pending).toBeNull();
  expect((initOf(hangs).signal as AbortSignal).aborted).toBe(true);
});

test('a caller that already left sends no request at all', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  expect(await requestSpeech('hello', 'en', ctrl.signal, hangs as unknown as typeof fetch)).toBeNull();
  expect(hangs).not.toHaveBeenCalled();
});

test(`it waits ${SPEECH_CLIENT_DEADLINE_MS} ms, longer than the route's deadline, then gives up; no timer is left behind`, async () => {
  jest.useFakeTimers();
  const pending = requestSpeech('hello', 'en', undefined, hangs as unknown as typeof fetch);
  await jest.advanceTimersByTimeAsync(SPEECH_CLIENT_DEADLINE_MS - 1);
  expect((initOf(hangs).signal as AbortSignal).aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(await pending).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
  expect(hangs).toHaveBeenCalledTimes(1);
});

test('a 401 opens the sign-in prompt (when there is a window) and is null', async () => {
  const dispatched: string[] = [];
  const g = globalThis as unknown as { window?: { dispatchEvent(e: Event): boolean } };
  g.window = { dispatchEvent: (e: Event) => { dispatched.push(e.type); return true; } };
  try {
    const f = jest.fn(async () => new Response('{"error":"unauthorized"}', { status: 401 }));
    expect(await requestSpeech('hello', 'en', undefined, f as unknown as typeof fetch)).toBeNull();
    expect(dispatched).toEqual(['myavatar:auth-required']);
  } finally {
    delete g.window;
  }
});
