/**
 * @jest-environment jsdom
 *
 * The "My twin" Avatar card: dark with the flag off, silent while the panel is closed, the twin's own (signed) face when
 * there is one — and renewed before the 15-minute URL lapses, so a picked card never points at a dead link.
 */
import { act, renderHook } from '@testing-library/react';
import { MY_TWIN_CARD_ID, MY_TWIN_RENEW_MS, myTwinCardItem, useMyTwin } from './useMyTwin';

const ENV = { ...process.env };
const ready = (front: string) => ({ ok: true, status: 200, json: async () => ({ status: 'ready', committedAt: 'x', consentVersion: 'v', voiceVerified: false, expiresIn: 900, urls: { front, left: 'l', right: 'r', voice: null } }) });
let fetchMock: jest.Mock;
const flush = () => act(async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); });

beforeEach(() => {
  process.env.NEXT_PUBLIC_TWIN_ENABLED = '1';
  fetchMock = jest.fn(async () => ready('https://p.supabase.co/storage/v1/object/sign/twins/a.jpg?token=1'));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  process.env = { ...ENV };
  jest.useRealTimers();
});

test('flag off → no card and no request, whatever the panel does', async () => {
  delete process.env.NEXT_PUBLIC_TWIN_ENABLED;
  const { result } = renderHook(() => useMyTwin(true));
  await flush();
  expect(result.current).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('the Avatar panel closed → nothing is fetched', async () => {
  const { result } = renderHook(() => useMyTwin(false));
  await flush();
  expect(result.current).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('panel open + a twin → its signed front photo; a guest (401) or no twin → no card', async () => {
  const { result } = renderHook(() => useMyTwin(true));
  await flush();
  expect(fetchMock).toHaveBeenCalledWith('/api/twin', { credentials: 'include' });
  expect(result.current).toBe('https://p.supabase.co/storage/v1/object/sign/twins/a.jpg?token=1');

  fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
  const guest = renderHook(() => useMyTwin(true));
  await flush();
  expect(guest.result.current).toBeNull();

  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'none' }) });
  const none = renderHook(() => useMyTwin(true));
  await flush();
  expect(none.result.current).toBeNull();
});

test('renewed before the URL lapses; a picked (stale) URL is handed over for the fresh one', async () => {
  jest.useFakeTimers();
  const onRenew = jest.fn();
  const { result } = renderHook(() => useMyTwin(true, onRenew));
  await flush();
  const first = result.current;
  fetchMock.mockResolvedValue(ready('https://p.supabase.co/storage/v1/object/sign/twins/a.jpg?token=2'));
  await act(async () => { jest.advanceTimersByTime(MY_TWIN_RENEW_MS); });
  await flush();
  expect(MY_TWIN_RENEW_MS).toBeLessThan(15 * 60 * 1000);
  expect(result.current).toBe('https://p.supabase.co/storage/v1/object/sign/twins/a.jpg?token=2');
  expect(onRenew).toHaveBeenCalledWith(first, result.current);
});

test('the card: first-class id, the twin’s face as its picture, localized', () => {
  expect(myTwinCardItem('ka', 'https://x/face')).toMatchObject({ id: MY_TWIN_CARD_ID, label: 'ჩემი ტყუპი', thumb: 'https://x/face' });
  expect(myTwinCardItem('en', 'https://x/face').label).toBe('My twin');
  expect(myTwinCardItem('ru', 'https://x/face').label).toBe('Мой двойник');
});
