/**
 * @jest-environment jsdom
 *
 * useChatStream: the transport of one chat turn. Every provider and every fetch is mocked here; nothing
 * leaves the process.
 *
 * ⚠️ WHAT THESE PIN.
 *  - A failed answer reaches the user as a typed, localized error. The old client showed one generic
 *    "Something went wrong" for everything and treated any stream as success.
 *  - A 401 opens sign-in (onAuthRequired) instead of an error bubble.
 *  - The 20 s first-token and 45 s idle watchdog still unwedges a hung stream. Without it a provider that
 *    accepts the connection and never answers leaves `busy` stuck and bricks the composer.
 *  - Stop and a new send abort only the chat stream and report nothing for the abandoned turn.
 *  - The controller's functions keep their identity across renders; the host's `send` depends on them.
 */
import { act, renderHook } from '@testing-library/react';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';
import { useChatStream, chatErrorMessage, FIRST_TOKEN_TIMEOUT_MS, IDLE_TIMEOUT_MS, type UseChatStreamOptions } from './useChatStream';
import { createChatStreamStore } from '@/components/chat/chatStreamStore';

// jsdom has no TextEncoder/TextDecoder; every browser does.
const g = globalThis as unknown as { TextDecoder?: unknown; TextEncoder?: unknown };
if (!g.TextDecoder) g.TextDecoder = NodeTextDecoder;
if (!g.TextEncoder) g.TextEncoder = NodeTextEncoder;

const enc = new NodeTextEncoder();

/** A response body the test feeds by hand. Cancelling it settles a pending read, as a browser does. */
function controllableBody() {
  const queue: Array<Uint8Array | null> = [];
  let pending: ((r: { done: boolean; value?: Uint8Array }) => void) | null = null;
  let closed = false;
  const reader = {
    read: () =>
      new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
        if (queue.length) {
          const v = queue.shift()!;
          resolve(v === null ? { done: true } : { done: false, value: v });
        } else if (closed) {
          resolve({ done: true });
        } else {
          pending = resolve;
        }
      }),
    cancel: async () => {
      closed = true;
      if (pending) {
        const p = pending;
        pending = null;
        p({ done: true });
      }
    },
    releaseLock: () => undefined,
  };
  const deliver = (v: Uint8Array | null) => {
    if (pending) {
      const p = pending;
      pending = null;
      p(v === null ? { done: true } : { done: false, value: v });
    } else {
      queue.push(v);
    }
  };
  return {
    body: { getReader: () => reader },
    /** Sends raw text, which may split a frame anywhere. */
    push: (s: string) => deliver(enc.encode(s)),
    /** Sends bytes as they are, to split a multi-byte character across chunks. */
    pushBytes: (b: Uint8Array) => deliver(b),
    close: () => deliver(null),
  };
}

function sseResponse(body: ReturnType<typeof controllableBody>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: body.body,
    text: async () => '',
  } as unknown as Response;
}

function jsonResponse(status: number, json: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { 'content-type': 'application/json', ...headers };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => h[k.toLowerCase()] ?? null },
    body: null,
    text: async () => JSON.stringify(json),
  } as unknown as Response;
}

const frame = (f: unknown) => `data: ${JSON.stringify(f)}\n\n`;

/** A fetch that answers with `respond(init)` and remembers the calls. */
function mockFetch(respond: (init: RequestInit) => Response | Promise<Response>) {
  return jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => respond(init ?? {})) as unknown as jest.MockedFunction<typeof fetch>;
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function setup(options: UseChatStreamOptions) {
  // A store whose frames never run on their own: the terminal flush is what the tests observe.
  const store = options.store ?? createChatStreamStore({ schedule: () => null, cancel: () => undefined });
  return renderHook((props: UseChatStreamOptions) => useChatStream(props), { initialProps: { ...options, store } });
}

describe('useChatStream — a successful turn', () => {
  it('streams meta, text split across chunks, sources and usage, then calls onDone once', async () => {
    const body = controllableBody();
    const fetchImpl = mockFetch(() => sseResponse(body));
    const onDone = jest.fn();
    const onError = jest.fn();
    const { result } = setup({ fetchImpl, onDone, onError, locale: 'en' });

    let done!: Promise<unknown>;
    act(() => {
      done = result.current.start({ messages: [{ role: 'user', content: 'hi' }] }, { turnId: 't1' });
    });
    await act(async () => {
      body.push(frame({ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } }));
      const t = frame({ text: 'გამარჯობა, ' });
      body.push(t.slice(0, 9)); // a frame split mid-line
      body.push(t.slice(9));
      // A Georgian letter is 3 bytes; split one across two chunks.
      const bytes = enc.encode(frame({ text: 'მეგობარო' }));
      body.pushBytes(bytes.slice(0, 14));
      body.pushBytes(bytes.slice(14));
      body.push(frame({ sources: [{ url: 'https://ex.ge/a', title: 'A' }, { url: 'javascript:alert(1)' }] }));
      body.push(frame({ usage: { model: 'gemini-3.8-flash', inputTokens: 5, outputTokens: 4 } }));
      body.push('data: [DONE]\n\n');
      await done;
    });

    expect(onError).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(
      'გამარჯობა, მეგობარო',
      { provider: 'gemini', model: 'gemini-3.8-flash' },
      [{ url: 'https://ex.ge/a', title: 'A' }],
      { model: 'gemini-3.8-flash', inputTokens: 5, outputTokens: 4 },
    );
    expect(result.current.store.getSnapshot()).toMatchObject({ status: 'done', text: 'გამარჯობა, მეგობარო', turnId: 't1' });

    // The request itself: JSON POST with cookies, to the chat route.
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/chat/gemini');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(String(init!.body))).toEqual({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.current.isActive()).toBe(false);
  });

  it('accepts the legacy stream (text frames, then close without [DONE])', async () => {
    const body = controllableBody();
    const onDone = jest.fn();
    const { result } = setup({ fetchImpl: mockFetch(() => sseResponse(body)), onDone });
    let done!: Promise<{ status: string }>;
    act(() => {
      done = result.current.start({});
    });
    await act(async () => {
      body.push(frame({ text: 'ok' }));
      body.close();
      await done;
    });
    expect((await done).status).toBe('done');
    expect(onDone).toHaveBeenCalledWith('ok', null, [], null);
  });
});

describe('useChatStream — typed, localized failures', () => {
  it('an {error} frame after partial text keeps the text and reports a localized error', async () => {
    const body = controllableBody();
    const onDone = jest.fn();
    const onError = jest.fn();
    const { result } = setup({ fetchImpl: mockFetch(() => sseResponse(body)), onDone, onError, locale: 'ka' });
    let done!: Promise<{ status: string }>;
    act(() => {
      done = result.current.start({});
    });
    await act(async () => {
      body.push(frame({ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } }));
      body.push(frame({ text: 'ნახევარი' }));
      body.push(frame({ meta: { provider: 'gemini', model: 'gemini-3.8-flash', partial: true } }));
      body.push(frame({ error: { code: 'quota', retryable: false, message: 'prepay depleted' } }));
      body.push('data: [DONE]\n\n');
      await done;
    });

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const [err, partial] = onError.mock.calls[0]!;
    expect(err).toMatchObject({ code: 'quota', retryable: false, reason: 'frame', detail: 'prepay depleted' });
    expect(err.message).toBe(chatErrorMessage('quota', 'ka'));
    expect(err.message).not.toContain('prepay'); // the provider's text never becomes the user's text
    expect(partial.text).toBe('ნახევარი');
    expect(result.current.store.getSnapshot()).toMatchObject({ status: 'error', text: 'ნახევარი' });
  });

  it.each([
    ['en', 'safety', "I can't answer that: the safety filter stopped it. Try rephrasing."],
    ['ru', 'rate_limited', 'Сейчас слишком много запросов. Подождите немного и попробуйте снова.'],
    ['ka', 'budget', 'ჩატის დღევანდელი ლიმიტი ამოიწურა. სცადე მოგვიანებით.'],
  ] as const)('localizes %s %s', async (locale, code, expected) => {
    const body = controllableBody();
    const onError = jest.fn();
    const { result } = setup({ fetchImpl: mockFetch(() => sseResponse(body)), onError, locale });
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.start({});
    });
    await act(async () => {
      body.push(frame({ error: { code, retryable: code === 'rate_limited', message: 'x' } }));
      body.close();
      await done;
    });
    expect(onError.mock.calls[0]![0]).toMatchObject({ code, message: expected });
  });

  it('401 calls onAuthRequired and reports auth_required, never onDone', async () => {
    const onAuthRequired = jest.fn();
    const onError = jest.fn();
    const onDone = jest.fn();
    const fetchImpl = mockFetch(() =>
      jsonResponse(401, { success: false, error: 'auth_required', authRequired: true, message: 'Sign in' }),
    );
    const { result } = setup({ fetchImpl, onAuthRequired, onError, onDone, locale: 'en' });
    let r!: { status: string; error: { code: string; status?: number; message: string } | null };
    await act(async () => {
      r = (await result.current.start({})) as typeof r;
    });
    expect(onAuthRequired).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(r.status).toBe('error');
    expect(r.error).toMatchObject({ code: 'auth_required', status: 401, message: 'Sign in to continue the chat.' });
  });

  it('an in-stream auth_required frame also opens sign-in', async () => {
    const body = controllableBody();
    const onAuthRequired = jest.fn();
    const { result } = setup({ fetchImpl: mockFetch(() => sseResponse(body)), onAuthRequired });
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.start({});
    });
    await act(async () => {
      body.push(frame({ error: { code: 'auth_required', retryable: false, message: '' } }));
      body.close();
      await done;
    });
    expect(onAuthRequired).toHaveBeenCalledTimes(1);
  });

  it('413 says the attachments are too large, not "something went wrong"', async () => {
    const onError = jest.fn();
    const { result } = setup({ fetchImpl: mockFetch(() => jsonResponse(413, { error: 'Body too large' })), onError, locale: 'en' });
    await act(async () => {
      await result.current.start({});
    });
    expect(onError.mock.calls[0]![0]).toMatchObject({
      code: 'bad_request',
      reason: 'too_large',
      retryable: false,
      message: 'The attachments are too large. Remove some and try again.',
    });
  });

  it('429 is retryable and carries Retry-After', async () => {
    const onError = jest.fn();
    const fetchImpl = mockFetch(() => jsonResponse(429, { error: 'Too many requests' }, { 'retry-after': '12' }));
    const { result } = setup({ fetchImpl, onError });
    await act(async () => {
      await result.current.start({});
    });
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'rate_limited', retryable: true, retryAfterSec: 12, status: 429 });
  });

  it('a typed error envelope on a 503 keeps its code', async () => {
    const onError = jest.fn();
    const fetchImpl = mockFetch(() => jsonResponse(503, { error: { code: 'quota', message: 'provider 402' } }));
    const { result } = setup({ fetchImpl, onError });
    await act(async () => {
      await result.current.start({});
    });
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'quota', status: 503 });
  });

  it('a clean close with no text is an "empty" failure, not a silent blank bubble', async () => {
    const body = controllableBody();
    const onError = jest.fn();
    const onDone = jest.fn();
    const { result } = setup({ fetchImpl: mockFetch(() => sseResponse(body)), onError, onDone, locale: 'en' });
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.start({});
    });
    await act(async () => {
      body.push(frame({ meta: { provider: 'gemini', model: 'm' } }));
      body.push('data: [DONE]\n\n');
      await done;
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: 'unavailable', reason: 'empty', retryable: true });
  });

  it('a network failure is a retryable network error', async () => {
    const onError = jest.fn();
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const { result } = setup({ fetchImpl, onError, locale: 'ru' });
    await act(async () => {
      await result.current.start({});
    });
    expect(onError.mock.calls[0]![0]).toMatchObject({
      code: 'network',
      retryable: true,
      message: 'Проблема с подключением. Проверьте интернет и попробуйте снова.',
    });
  });
});

describe('useChatStream — watchdog', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('aborts a stream with no first token after 20 s and reports a timeout', async () => {
    const body = controllableBody();
    const onError = jest.fn();
    const { result } = setup({ fetchImpl: mockFetch(() => sseResponse(body)), onError, locale: 'en' });
    let done!: Promise<{ status: string }>;
    act(() => {
      done = result.current.start({});
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(FIRST_TOKEN_TIMEOUT_MS - 1);
    });
    expect(onError).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2);
      await done;
    });
    expect((await done).status).toBe('error');
    expect(onError.mock.calls[0]![0]).toMatchObject({
      code: 'network',
      reason: 'timeout',
      retryable: true,
      message: 'The answer is taking too long. Please try again.',
    });
  });

  it('after the first token the window is 45 s of silence, re-armed by every chunk', async () => {
    const body = controllableBody();
    const onError = jest.fn();
    const onFirstToken = jest.fn();
    const { result } = setup({ fetchImpl: mockFetch(() => sseResponse(body)), onError, onFirstToken });
    let done!: Promise<{ status: string; text: string }>;
    act(() => {
      done = result.current.start({});
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
      body.push(frame({ text: 'first' }));
      await flush();
    });
    expect(onFirstToken).toHaveBeenCalledTimes(1);
    // 30 s of silence would have tripped the pre-token window; mid-answer it must not.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
      body.push(frame({ text: ' second' }));
      await flush();
      await jest.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 1);
    });
    expect(onError).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2);
      await done;
    });
    const r = await done;
    expect(r.status).toBe('error');
    expect(r.text).toBe('first second'); // the partial answer survives the timeout
    expect(onError.mock.calls[0]![0]).toMatchObject({ reason: 'timeout' });
  });

  it('a stream that completes disarms the watchdog', async () => {
    const body = controllableBody();
    const onError = jest.fn();
    const { result } = setup({ fetchImpl: mockFetch(() => sseResponse(body)), onError });
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.start({});
    });
    await act(async () => {
      body.push(frame({ text: 'x' }));
      body.push('data: [DONE]\n\n');
      await done;
      await jest.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS * 2);
    });
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('useChatStream — stop, supersede and identity', () => {
  it('stop() aborts, keeps the partial text and reports nothing', async () => {
    const body = controllableBody();
    const onDone = jest.fn();
    const onError = jest.fn();
    const { result } = setup({ fetchImpl: mockFetch(() => sseResponse(body)), onDone, onError });
    let done!: Promise<{ status: string; text: string }>;
    act(() => {
      done = result.current.start({});
    });
    await act(async () => {
      body.push(frame({ text: 'half' }));
      await flush();
      result.current.stop();
      await done;
    });
    const r = await done;
    expect(r).toMatchObject({ status: 'aborted', text: 'half' });
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.store.getSnapshot()).toMatchObject({ status: 'aborted', text: 'half' });
    expect(result.current.isActive()).toBe(false);
  });

  it('a second start() aborts the first; only the second writes the store', async () => {
    const bodies = [controllableBody(), controllableBody()];
    let call = 0;
    const onDone = jest.fn();
    const { result } = setup({ fetchImpl: mockFetch(() => sseResponse(bodies[call++]!)), onDone });
    let first!: Promise<{ status: string }>;
    let second!: Promise<{ status: string }>;
    act(() => {
      first = result.current.start({ n: 1 }, { turnId: 'a' });
    });
    await act(async () => {
      bodies[0]!.push(frame({ text: 'old' }));
      await flush();
      second = result.current.start({ n: 2 }, { turnId: 'b' });
      bodies[0]!.push(frame({ text: ' LEAK' }));
      bodies[1]!.push(frame({ text: 'new' }));
      bodies[1]!.push('data: [DONE]\n\n');
      await Promise.all([first, second]);
    });
    expect((await first).status).toBe('aborted');
    expect((await second).status).toBe('done');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0]![0]).toBe('new');
    expect(result.current.store.getSnapshot()).toMatchObject({ turnId: 'b', text: 'new', status: 'done' });
  });

  it('keeps the controller and its functions stable across renders, and calls the LATEST callbacks', async () => {
    const body = controllableBody();
    const fetchImpl = mockFetch(() => sseResponse(body));
    const firstOnDone = jest.fn();
    const latestOnDone = jest.fn();
    const { result, rerender } = setup({ fetchImpl, onDone: firstOnDone });
    const c0 = result.current;
    const { start, stop, isActive, reset, store } = c0;

    let done!: Promise<unknown>;
    act(() => {
      done = result.current.start({});
    });
    rerender({ fetchImpl, onDone: latestOnDone, store });
    expect(result.current).toBe(c0);
    expect(result.current.start).toBe(start);
    expect(result.current.stop).toBe(stop);
    expect(result.current.isActive).toBe(isActive);
    expect(result.current.reset).toBe(reset);
    expect(result.current.store).toBe(store);

    await act(async () => {
      body.push(frame({ text: 'hi' }));
      body.close();
      await done;
    });
    expect(firstOnDone).not.toHaveBeenCalled();
    expect(latestOnDone).toHaveBeenCalledWith('hi', null, [], null);
  });

  it('unmounting aborts the running stream', async () => {
    const body = controllableBody();
    let seenSignal: AbortSignal | undefined;
    const fetchImpl = mockFetch((init) => {
      seenSignal = init.signal ?? undefined;
      return sseResponse(body);
    });
    const { result, unmount } = setup({ fetchImpl });
    let done!: Promise<{ status: string }>;
    act(() => {
      done = result.current.start({});
    });
    await act(async () => {
      await flush();
    });
    unmount();
    expect(seenSignal?.aborted).toBe(true);
    expect((await done).status).toBe('aborted');
  });
});

describe('chatErrorMessage', () => {
  it('falls back to Georgian for an unknown locale and prefers the transport reason', () => {
    expect(chatErrorMessage('unavailable', 'de')).toBe('პასუხის მიღება ვერ მოხერხდა. სცადე თავიდან.');
    expect(chatErrorMessage('network', 'en', 'timeout')).toBe('The answer is taking too long. Please try again.');
  });
});
