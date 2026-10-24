/**
 * lib/library/libraryQuery — the Library's one data layer (§4.2): private by account, never the browser's HTTP cache,
 * obsolete requests aborted, a failure never stored as an empty Library, and a deleted file gone from every loaded page.
 */
import { act, render, screen } from '@testing-library/react';
import { notifyManager, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';

type Session = { user: { id: string } } | null;
let session: Session = null;
let sessionRead: Promise<void> = Promise.resolve();
let authListener: ((event: string, s: Session) => void) | null = null;
jest.mock('../supabase/browser', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: async () => { await sessionRead; return { data: { session }, error: null }; },
      onAuthStateChange: (cb: (event: string, s: Session) => void) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  }),
}));

import {
  LIBRARY_UPDATED_EVENT, fetchLibraryPage, libraryKeys, removeLibraryItem, resetLibraryOwnerForTests, useLibraryFeed, useLibraryPage,
} from './libraryQuery';

notifyManager.setScheduler((run) => run());

const item = (id: string, kind = 'film') => ({ id, kind, url: `https://ours.supabase.co/storage/v1/object/sign/renders/${id}.mp4?token=t`, prompt: id, orientation: 'landscape' as const, createdAt: '2026-10-24T00:00:00Z' });
let calls: { url: string; init?: RequestInit }[] = [];
let answer: (url: string) => { ok: boolean; status: number; items?: unknown[] } = () => ({ ok: true, status: 200, items: [] });
let client: QueryClient;

beforeEach(() => {
  resetLibraryOwnerForTests();
  authListener = null;
  session = { user: { id: 'user-a' } };
  sessionRead = Promise.resolve();
  calls = [];
  client = new QueryClient();
  answer = () => ({ ok: true, status: 200, items: [item('a1')] });
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const a = answer(url);
    return { ok: a.ok, status: a.status, json: async () => ({ items: a.items }) };
  }) as unknown as typeof fetch;
});

function Page({ kind = 'film,avatar' }: { kind?: string }) {
  const q = useLibraryPage(kind, 12, 0);
  return <ul data-testid="page" data-error={q.isError ? '1' : '0'}>{q.data?.items.map((it) => <li key={it.id}>{it.id}</li>)}</ul>;
}
function Feed() {
  const q = useLibraryFeed(24);
  return <ul data-testid="feed">{q.data?.pages.flatMap((p) => p.items).map((it) => <li key={it.id}>{it.id}</li>)}</ul>;
}
function mount(ui: React.ReactElement) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
const ids = (testId: string) => [...screen.getByTestId(testId).querySelectorAll('li')].map((li) => li.textContent);
const ownersInCache = () => [...new Set(client.getQueryCache().getAll().map((q) => q.queryKey[1]))];

test('the request skips the browser cache, carries the abort signal, and keeps today\'s query string', async () => {
  await act(async () => { mount(<Page />); });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe('/api/studio/library?kind=film%2Cavatar&limit=12&offset=0');
  expect(calls[0]!.init).toMatchObject({ cache: 'no-store', credentials: 'include' });
  expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  expect(ids('page')).toEqual(['a1']);
  // The Favorites window: every kind, the newest 60, no offset (as the page asked before).
  await act(async () => { await fetchLibraryPage({ limit: 60 }); });
  expect(calls[1]!.url).toBe('/api/studio/library?limit=60');
});

test('every key starts with the account; a sign-in as someone else drops the first account\'s works', async () => {
  await act(async () => { mount(<><Page /><Feed /></>); });
  expect(ownersInCache()).toEqual(['user-a']);
  expect(client.getQueryData(libraryKeys.page('user-a', 'film,avatar', 12, 0))).toEqual({ items: [item('a1')] });

  answer = () => ({ ok: true, status: 200, items: [item('b1')] });
  await act(async () => { authListener!('SIGNED_IN', { user: { id: 'user-b' } }); });
  expect(ownersInCache()).toEqual(['user-b']);
  expect(ids('page')).toEqual(['b1']);
  expect(ids('feed')).toEqual(['b1']);

  // Signed out: nothing of user-b stays in memory either.
  answer = () => ({ ok: false, status: 401 });
  await act(async () => { authListener!('SIGNED_OUT', null); });
  expect(ownersInCache()).toEqual(['guest']);
  expect(ids('page')).toEqual([]);
});

test('nothing is asked before the session is read, so no answer is filed under the wrong account', async () => {
  let release: () => void = () => {};
  sessionRead = new Promise<void>((r) => { release = r; });
  await act(async () => { mount(<Page />); });
  expect(calls).toHaveLength(0);
  expect(ids('page')).toEqual([]);
  await act(async () => { release(); });
  expect(calls).toHaveLength(1);
  expect(ownersInCache()).toEqual(['user-a']);
});

test('a failure is an error, not a stored empty Library', async () => {
  answer = () => ({ ok: false, status: 500 });
  await act(async () => { mount(<Page />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 1100)); }); // one quiet retry, then the error
  expect(screen.getByTestId('page').getAttribute('data-error')).toBe('1');
  expect(client.getQueryData(libraryKeys.page('user-a', 'film,avatar', 12, 0))).toBeUndefined();
  expect(calls).toHaveLength(2);
});

test('a 4xx is not retried', async () => {
  answer = () => ({ ok: false, status: 401 });
  await act(async () => { mount(<Page />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 1100)); });
  expect(calls).toHaveLength(1);
});

test('a saved file refreshes every loaded page of the account', async () => {
  await act(async () => { mount(<><Page /><Feed /></>); });
  expect(calls).toHaveLength(2);
  answer = () => ({ ok: true, status: 200, items: [item('new'), item('a1')] });
  await act(async () => { window.dispatchEvent(new Event(LIBRARY_UPDATED_EVENT)); });
  expect(ids('page')).toEqual(['new', 'a1']);
  expect(ids('feed')).toEqual(['new', 'a1']);
});

test('a deleted file leaves every loaded page at once, without a request', async () => {
  answer = () => ({ ok: true, status: 200, items: [item('a1'), item('a2')] });
  let qc: ReturnType<typeof useQueryClient> | null = null;
  function Grab() { qc = useQueryClient(); return null; }
  await act(async () => { mount(<><Page /><Feed /><Grab /></>); });
  const before = calls.length;
  act(() => { removeLibraryItem(qc!, 'user-a', 'a1'); });
  expect(ids('page')).toEqual(['a2']);
  expect(ids('feed')).toEqual(['a2']);
  expect(calls).toHaveLength(before);
  expect(client.getQueryState(libraryKeys.page('user-a', 'film,avatar', 12, 0))?.isInvalidated).toBe(true);
});
