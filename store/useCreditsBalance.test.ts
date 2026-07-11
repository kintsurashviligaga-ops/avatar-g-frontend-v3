import { useCreditsBalance } from './useCreditsBalance';

describe('useCreditsBalance — TTL cache + dedup + invalidation', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    useCreditsBalance.setState({ balance: null, fetchedAt: 0, inflight: null });
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockBalance(value: number) {
    const fn = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ balance: value }) });
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  test('first get fetches; a second get within TTL is served from cache (no 2nd fetch)', async () => {
    const fn = mockBalance(93);
    expect(await useCreditsBalance.getState().get()).toBe(93);
    expect(await useCreditsBalance.getState().get()).toBe(93);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('get(true) forces a refetch even within TTL', async () => {
    const fn = mockBalance(50);
    await useCreditsBalance.getState().get();
    await useCreditsBalance.getState().get(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('concurrent gets coalesce onto a single in-flight fetch', async () => {
    const fn = mockBalance(10);
    const [a, b] = await Promise.all([
      useCreditsBalance.getState().get(),
      useCreditsBalance.getState().get(),
    ]);
    expect(a).toBe(10);
    expect(b).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('invalidate() drops the cache so the next get refetches (cross-user safety)', async () => {
    const fn = mockBalance(7);
    await useCreditsBalance.getState().get();
    useCreditsBalance.getState().invalidate();
    expect(useCreditsBalance.getState().balance).toBeNull();
    await useCreditsBalance.getState().get();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('a failed fetch keeps the last known value (fail-safe, display-only)', async () => {
    mockBalance(80);
    await useCreditsBalance.getState().get();
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    expect(await useCreditsBalance.getState().get(true)).toBe(80);
  });
});
