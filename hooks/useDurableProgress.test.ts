/** @jest-environment jsdom */
import { renderHook, act } from '@testing-library/react';
import { nextPollDelay, POLL_SIGNED_OUT_MS, useDurableProgress } from './useDurableProgress';

describe('nextPollDelay', () => {
  it('waits 5 minutes after a signed-out 401', () => {
    expect(nextPollDelay({ status: 401, hadActive: false })).toBe(POLL_SIGNED_OUT_MS);
  });
  it('polls fast while jobs run and slow when idle', () => {
    expect(nextPollDelay({ status: 200, hadActive: true })).toBe(7000);
    expect(nextPollDelay({ status: 200, hadActive: false })).toBe(20000);
    expect(nextPollDelay({ status: 429, hadActive: false })).toBe(20000);
    expect(nextPollDelay({ status: null, hadActive: false })).toBe(20000);
  });
});

describe('useDurableProgress', () => {
  const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };
  let fetchMock: jest.Mock;
  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    document.documentElement.dataset.authed = '0';
  });
  afterEach(() => { jest.useRealTimers(); });

  it('a signed-out visitor is not polled every 20 s', async () => {
    renderHook(() => useDurableProgress('ka'));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(60_000); });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('signing in asks again at once', async () => {
    renderHook(() => useDurableProgress('ka'));
    await flush();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, tasks: [] }) });
    await act(async () => { document.documentElement.dataset.authed = '1'; });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a hidden tab skips the request', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, tasks: [] }) });
    renderHook(() => useDurableProgress('ka'));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const spy = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => { jest.advanceTimersByTime(20_000); });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    spy.mockReturnValue('visible');
    await act(async () => { jest.advanceTimersByTime(20_000); });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
