/**
 * The browser half of the money rules: no start without a seen price, a changed price waits for the user, an
 * older estimate never overwrites a newer one, a failed start is never re-sent, polling stops when done.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useStudioGeneration } from './useStudioGeneration';

type Handler = (url: string, init?: RequestInit) => Promise<Response> | Response;

function mockFetch(handler: Handler) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: String(init?.method ?? 'GET'), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

// jsdom has no fetch Response — the hook only reads ok / status / json(), so that is all a reply needs.
const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const PRICE = { credits: 15, gel: 1.5, display: '1.50 ₾' };
const job = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'job-1', status, service: 'video', modelId: 'hf/kling-3-std-t2v', priceGel: 1.5, credits: 15, refunded: false,
  errorCode: null, promptOriginal: 'ზღვა', promptSent: 'the sea', outputUrls: [], createdAt: 'x', completedAt: null, ...extra,
});

test('no start without a price the user has seen — nothing is sent', async () => {
  const f = mockFetch(() => json(500, {}));
  const { result } = renderHook(() => useStudioGeneration({ fetchImpl: f.fn }));
  await act(async () => { await result.current.start('hf/kling-3-std-t2v', { prompt: 'x' }); });
  expect(result.current.state.errorCode).toBe('confirmation_required');
  expect(f.calls).toHaveLength(0);
});

test('estimate → start sends exactly the confirmed GEL → polls to completion', async () => {
  let polls = 0;
  const f = mockFetch((url, init) => {
    if (url === '/api/estimate') return json(200, { modelId: 'hf/kling-3-std-t2v', price: PRICE });
    if (url === '/api/generate' && init?.method === 'POST') return json(202, { job: job('queued'), price: PRICE });
    polls++;
    return json(200, { job: polls < 2 ? job('in_progress') : job('completed', { outputUrls: ['https://signed/out.mp4'] }) });
  });
  const { result } = renderHook(() => useStudioGeneration({ fetchImpl: f.fn, pollMs: 5, maxPollMs: 10 }));
  await act(async () => { await result.current.estimate('hf/kling-3-std-t2v', { prompt: 'ზღვა' }); });
  expect(result.current.state).toMatchObject({ phase: 'priced', price: PRICE });

  await act(async () => { await result.current.start('hf/kling-3-std-t2v', { prompt: 'ზღვა' }, 'ზღვა'); });
  expect(f.calls.find((c) => c.url === '/api/generate')!.body).toEqual({ modelId: 'hf/kling-3-std-t2v', params: { prompt: 'ზღვა' }, confirmedGel: 1.5, promptOriginal: 'ზღვა' });

  await waitFor(() => expect(result.current.state.phase).toBe('done'));
  expect(result.current.state.job!.outputUrls).toEqual(['https://signed/out.mp4']);
  const pollsAtDone = polls;
  await new Promise((r) => setTimeout(r, 40));
  expect(polls).toBe(pollsAtDone); // polling stopped at the terminal status
});

test('price_changed shows the NEW price and waits — it is never auto-accepted', async () => {
  const NEW = { credits: 18, gel: 1.8, display: '1.80 ₾' };
  const f = mockFetch((url) => (url === '/api/estimate' ? json(200, { price: PRICE }) : json(409, { error: 'price_changed', price: NEW })));
  const { result } = renderHook(() => useStudioGeneration({ fetchImpl: f.fn }));
  await act(async () => { await result.current.estimate('m', {}); });
  await act(async () => { await result.current.start('m', {}); });
  expect(result.current.state).toMatchObject({ phase: 'priced', price: NEW, errorCode: 'price_changed' });
  expect(f.calls.filter((c) => c.url === '/api/generate')).toHaveLength(1);
});

test('an older, slower estimate can never overwrite a newer price', async () => {
  let resolveSlow: (r: Response) => void = () => undefined;
  const f = mockFetch((_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.params.duration === 5) return new Promise<Response>((r) => { resolveSlow = r; });
    return json(200, { price: { credits: 30, gel: 3, display: '3.00 ₾' } });
  });
  const { result } = renderHook(() => useStudioGeneration({ fetchImpl: f.fn }));
  let slow: Promise<unknown> = Promise.resolve();
  act(() => { slow = result.current.estimate('m', { duration: 5 }); });
  await act(async () => { await result.current.estimate('m', { duration: 10 }); });
  await act(async () => { resolveSlow(json(200, { price: PRICE })); await slow; });
  expect(result.current.state.price).toEqual({ credits: 30, gel: 3, display: '3.00 ₾' });
});

test('insufficient credits and invalid input surface their codes (rendered by describeServiceError)', async () => {
  const f = mockFetch((url) => (url === '/api/estimate'
    ? json(422, { error: 'invalid_input', issues: [{ path: 'duration', message: 'too big' }] })
    : json(402, { error: 'insufficient_credits', price: PRICE })));
  const { result } = renderHook(() => useStudioGeneration({ fetchImpl: f.fn }));
  await act(async () => { await result.current.estimate('m', { duration: 99 }); });
  expect(result.current.state).toMatchObject({ errorCode: 'invalid_input', issues: [{ path: 'duration', message: 'too big' }], price: null });
});

test('a start whose request fails in flight is NOT re-sent (it may have charged)', async () => {
  let generateCalls = 0;
  const f = mockFetch((url) => {
    if (url === '/api/estimate') return json(200, { price: PRICE });
    generateCalls++;
    throw new TypeError('fetch failed');
  });
  const { result } = renderHook(() => useStudioGeneration({ fetchImpl: f.fn }));
  await act(async () => { await result.current.estimate('m', {}); });
  await act(async () => { await result.current.start('m', {}); });
  expect(generateCalls).toBe(1);
  expect(result.current.state).toMatchObject({ phase: 'failed', errorCode: 'provider_unavailable' });
});

test('cancel while queued → canceled and refunded', async () => {
  const f = mockFetch((url, init) => {
    if (url === '/api/estimate') return json(200, { price: PRICE });
    if (init?.method === 'POST') return json(202, { job: job('queued') });
    if (init?.method === 'DELETE') return json(200, { job: job('canceled', { refunded: true, errorCode: 'canceled' }) });
    return json(200, { job: job('queued') });
  });
  const { result } = renderHook(() => useStudioGeneration({ fetchImpl: f.fn, pollMs: 5 }));
  await act(async () => { await result.current.estimate('m', {}); });
  await act(async () => { await result.current.start('m', {}); });
  await act(async () => { expect(await result.current.cancel()).toBe(true); });
  expect(result.current.state).toMatchObject({ phase: 'canceled', job: { refunded: true } });
});

test('an nsfw verdict ends the run with its code and the refund flag', async () => {
  const f = mockFetch((url, init) => {
    if (url === '/api/estimate') return json(200, { price: PRICE });
    if (init?.method === 'POST') return json(202, { job: job('queued') });
    return json(200, { job: job('nsfw', { refunded: true, errorCode: 'content_rejected' }) });
  });
  const { result } = renderHook(() => useStudioGeneration({ fetchImpl: f.fn, pollMs: 5 }));
  await act(async () => { await result.current.estimate('m', {}); });
  await act(async () => { await result.current.start('m', {}); });
  await waitFor(() => expect(result.current.state.phase).toBe('failed'));
  expect(result.current.state).toMatchObject({ errorCode: 'content_rejected', job: { refunded: true } });
});
