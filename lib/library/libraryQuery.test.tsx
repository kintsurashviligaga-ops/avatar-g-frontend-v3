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
  LIBRARY_UPDATED_EVENT, LibraryFetchError, type LibraryPage, fetchLibraryPage, forgetLibraryLink, keepLiveLinks, libraryFailure, libraryKeys,
  removeLibraryItem, resetLibraryOwnerForTests, useLibraryFeed, useLibraryPage,
} from './libraryQuery';
import { keepVideo, keptVideoCount, videoKey } from './videoPool';

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
  expect(client.getQueryData(libraryKeys.page('user-a', 'film,avatar', 12, 0))).toEqual({ items: [item('a1')], demo: false, nextCursor: null });

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

test('the answer says whether it is the demo library and where the next page starts; `before` is sent as given', async () => {
  global.fetch = jest.fn(async (url: string) => {
    calls.push({ url });
    return { ok: true, status: 200, json: async () => ({ items: [item('d1')], demo: true, nextCursor: 'abc' }) };
  }) as unknown as typeof fetch;
  await expect(fetchLibraryPage({ limit: 24, before: 'eyJ0Ijoi' })).resolves.toEqual({ items: [item('d1')], demo: true, nextCursor: 'abc' });
  expect(calls[0]!.url).toBe('/api/studio/library?limit=24&before=eyJ0Ijoi');
});

test('a failure is „unavailable" for a 503 or no answer at all, „failed" otherwise', () => {
  expect(libraryFailure(new LibraryFetchError(503))).toBe('unavailable');
  expect(libraryFailure(new TypeError('Failed to fetch'))).toBe('unavailable');
  expect(libraryFailure(new LibraryFetchError(500))).toBe('failed');
  expect(libraryFailure(new LibraryFetchError(400))).toBe('failed');
});

test('200+ works scroll in whole, each exactly once, while files are saved and deleted between pages (§4.2.4)', async () => {
  // A route with the real cursor rule: newest first, then id; `before` = strictly after that row.
  type Row = ReturnType<typeof item>;
  let rows: Row[] = Array.from({ length: 210 }, (_, i) => ({ ...item(`w${String(i).padStart(3, '0')}`), createdAt: new Date(Date.parse('2026-10-24T00:00:00Z') - Math.floor(i / 3) * 60_000).toISOString() }));
  const order = (a: Row, b: Row) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1);
  rows.sort(order);
  global.fetch = jest.fn(async (url: string) => {
    const q = new URL(url, 'https://x').searchParams;
    const limit = Number(q.get('limit'));
    const before = q.get('before') ? (JSON.parse(q.get('before')!) as { t: string; i: string }) : null;
    const after = before ? rows.filter((r) => r.createdAt < before.t || (r.createdAt === before.t && r.id < before.i)) : rows;
    const page = after.slice(0, limit);
    const last = page.length === limit ? page[page.length - 1]! : null;
    return { ok: true, status: 200, json: async () => ({ items: page, demo: false, nextCursor: last ? JSON.stringify({ t: last.createdAt, i: last.id }) : null }) };
  }) as unknown as typeof fetch;

  let feed: ReturnType<typeof useLibraryFeed> | null = null;
  function Grab() { feed = useLibraryFeed(24); return null; }
  await act(async () => { mount(<Grab />); });
  const original = new Set(rows.map((r) => r.id));
  let turn = 0;
  while (feed!.hasNextPage) {
    // Between two pages: a new file lands on top, and a file already loaded is deleted.
    rows = [{ ...item(`new${turn}`), createdAt: new Date(Date.parse('2026-10-24T01:00:00Z') + turn * 1000).toISOString() }, ...rows].sort(order);
    rows = rows.filter((r) => r.id !== `w${String(turn * 5).padStart(3, '0')}`);
    turn += 1;
    await act(async () => { await feed!.fetchNextPage(); });
  }
  const loaded = feed!.data!.pages.flatMap((p) => p.items.map((it) => it.id));
  expect(loaded.length).toBe(new Set(loaded).size); // nothing twice
  const missing = [...original].filter((id) => !loaded.includes(id) && rows.some((r) => r.id === id));
  expect(missing).toEqual([]); // nothing still there was skipped
  expect(loaded.filter((id) => original.has(id)).length).toBeGreaterThanOrEqual(200);
});

test('a tab whose links are about to run out is fetched again on return; a fresh one is not', async () => {
  const soon = new Date(Date.now() + 5 * 60_000).toISOString();
  const later = new Date(Date.now() + 23 * 3600_000).toISOString();
  answer = (url) => ({ ok: true, status: 200, items: [{ ...item(url.includes('music') ? 'm1' : 'f1'), expiresAt: url.includes('music') ? later : soon }] });
  const view = mount(<Page kind="film,avatar" />);
  await act(async () => {});
  await act(async () => { view.rerender(<QueryClientProvider client={client}><Page kind="music" /></QueryClientProvider>); });
  await act(async () => { view.rerender(<QueryClientProvider client={client}><Page kind="film,avatar" /></QueryClientProvider>); });
  expect(calls.map((c) => new URL(c.url, 'https://x').searchParams.get('kind'))).toEqual(['film,avatar', 'music', 'film,avatar']);
  await act(async () => { view.rerender(<QueryClientProvider client={client}><Page kind="music" /></QueryClientProvider>); });
  expect(calls).toHaveLength(3); // music's links last a day: its return sends nothing
});

describe('links kept while good (§4.2.3, §4.2.5)', () => {
  const NOW = Date.parse('2026-10-24T08:00:00Z');
  const at = (ms: number) => new Date(NOW + ms).toISOString();
  const HOUR = 3600_000;
  const signed = (id: string, token: string, expiresAt: string, object = id) =>
    ({ ...item(id), url: `https://ours.supabase.co/storage/v1/object/sign/renders/${object}.mp4?token=${token}`, expiresAt });
  const page = (items: ReturnType<typeof item>[]): LibraryPage => ({ items, demo: false, nextCursor: null });
  const tokens = (p: LibraryPage) => p.items.map((it) => new URL(it.url).searchParams.get('token') ?? it.url);

  test('a refreshed page keeps a link still good for the same file; one about to run out, another file or an unsigned link is replaced', () => {
    const old = page([
      signed('a', 'old', at(HOUR)), signed('b', 'old', at(5 * 60_000)), signed('c', 'old', at(HOUR)),
      { ...item('d'), url: 'https://cdn.example.com/d.mp4' },
    ]);
    const next = page([
      signed('a', 'new', at(2 * HOUR)), signed('b', 'new', at(2 * HOUR)),
      signed('c', 'new', at(2 * HOUR), 'c-rerendered'), // the work's file was replaced
      { ...item('d'), url: 'https://cdn.example.com/d2.mp4' }, // no expiresAt: not this route's signed link
      signed('e', 'new', at(2 * HOUR)), // new on the page
    ]);
    const out = keepLiveLinks(old, next, NOW);
    expect(tokens(out)).toEqual(['old', 'new', 'new', 'https://cdn.example.com/d2.mp4', 'new']);
    expect(out.items[0]!.expiresAt).toBe(at(HOUR)); // the kept link's own expiry, so it is refreshed in time
    expect(out.items[1]!.expiresAt).toBe(at(2 * HOUR));
    expect(out.items[2]!.url).toContain('c-rerendered.mp4');
  });

  test('nothing kept is `next` itself; the endless list keeps links across its pages; a link that failed is never kept', () => {
    const next = page([signed('a', 'new', at(2 * HOUR))]);
    expect(keepLiveLinks(undefined, next, NOW)).toBe(next);
    expect(keepLiveLinks(page([signed('a', 'new', at(2 * HOUR))]), next, NOW)).toBe(next); // the same link: nothing to keep
    expect(keepLiveLinks(page([signed('z', 'old', at(HOUR))]), next, NOW)).toBe(next);

    const feed = (a: LibraryPage, b: LibraryPage) => ({ pages: [a, b], pageParams: [undefined, 'c1'] });
    const kept = keepLiveLinks(feed(page([signed('a', 'old', at(HOUR))]), page([signed('b', 'old', at(HOUR))])),
      feed(page([signed('b', 'new', at(2 * HOUR))]), page([signed('a', 'new', at(2 * HOUR))])), NOW); // moved between pages
    expect(kept.pages.map(tokens)).toEqual([['old'], ['old']]);
    expect(kept.pageParams).toEqual([undefined, 'c1']);

    const old = page([signed('a', 'old', at(HOUR))]);
    forgetLibraryLink(`${old.items[0]!.url}#t=0.1`); // as the card reports it, with its media fragment
    expect(tokens(keepLiveLinks(old, next, NOW))).toEqual(['new']);
  });

  test('a page fetched again keeps the link on screen; after a failure the fresh one replaces it', async () => {
    let token = 0;
    answer = () => ({ ok: true, status: 200, items: [signed('a1', `t${++token}`, new Date(Date.now() + 23 * HOUR).toISOString())] });
    await act(async () => { mount(<Page />); });
    const key = libraryKeys.page('user-a', 'film,avatar', 12, 0);
    const first = client.getQueryData<LibraryPage>(key)!;
    expect(tokens(first)).toEqual(['t1']);

    await act(async () => { await client.refetchQueries({ queryKey: key }); });
    expect(calls).toHaveLength(2);
    expect(client.getQueryData<LibraryPage>(key)).toBe(first); // unchanged: the same object, nothing re-rendered

    forgetLibraryLink(first.items[0]!.url);
    await act(async () => { await client.refetchQueries({ queryKey: key }); });
    expect(tokens(client.getQueryData<LibraryPage>(key)!)).toEqual(['t3']);
  });

  test('a sign-in as someone else lets go of the first account\'s kept films', async () => {
    const load = jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    await act(async () => { mount(<Page />); });
    const film = document.createElement('video');
    film.setAttribute('src', item('a1').url);
    keepVideo(videoKey('user-a', 'a1'), film);
    expect(keptVideoCount()).toBe(1);
    await act(async () => { authListener!('SIGNED_IN', { user: { id: 'user-b' } }); });
    expect(keptVideoCount()).toBe(0);
    expect(film.hasAttribute('src')).toBe(false);
    load.mockRestore();
  });
});
