/**
 * The /library page's stars are the account's (§4.2.4): a star is saved on the server (PATCH /api/studio/library) and
 * shows at once, a refused one goes back and says so, the Favorites tab pages through every starred work like any other
 * tab, and the stars this browser kept before move to the account. Signed in here (the session is mocked), unlike
 * LibraryGallery.test, whose visitor the Library sees as 'guest'.
 */
import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { DEVICE_FAVORITES_KEY, resetDeviceFavoritesForTests, resetLibraryOwnerForTests } from '../../lib/library/libraryQuery';
import { saveLibraryView } from '../../lib/library/libraryView';

let session: { user: { id: string } } | null = { user: { id: 'user-s' } };
jest.mock('../../lib/supabase/browser', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/media/saveMedia', () => ({ saveMedia: jest.fn(async () => 'downloaded') }));
jest.mock('../studio/create/newtools/PlanView', () => ({ PlanView: () => null }));

import LibraryGallery from './LibraryGallery';

notifyManager.setScheduler((run) => run());
let client: QueryClient;
function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

const film = (id: string, favorite?: boolean) => ({
  id, kind: 'film', url: `https://ours.supabase.co/storage/v1/object/sign/renders/${id}.mp4?token=t`, prompt: id, orientation: 'landscape',
  createdAt: '2026-10-24T00:00:00Z', ...(favorite === undefined ? {} : { favorite }),
});

type Patch = { id?: string; ids?: string[]; favorite: boolean };
let reads: URLSearchParams[] = [];
let patches: Patch[] = [];
let log: string[] = []; // 'read' when a read starts, 'saved' when a PATCH answers
let read: (q: URLSearchParams) => { items: unknown[]; demo?: boolean } = () => ({ items: [] });
// How the server answers a PATCH; `hold` keeps it open until the test lets it go.
let patchAnswer: (body: Patch) => { ok: boolean; status: number; ids?: string[] } = (b) => ({ ok: true, status: 200, ids: b.ids ?? [b.id!] });
let hold: Promise<void> | null = null;

beforeEach(() => {
  // jsdom plays no media: a film let go (lib/library/videoPool) asks the browser to drop its file.
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  resetLibraryOwnerForTests();
  resetDeviceFavoritesForTests();
  window.localStorage.clear();
  window.sessionStorage.clear();
  session = { user: { id: 'user-s' } };
  client = new QueryClient();
  reads = [];
  patches = [];
  log = [];
  hold = null;
  read = () => ({ items: [film('f1', false), film('f2', true)] });
  patchAnswer = (b) => ({ ok: true, status: 200, ids: b.ids ?? [b.id!] });
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as Patch;
      patches.push(body);
      if (hold) await hold;
      const a = patchAnswer(body);
      log.push('saved');
      return { ok: a.ok, status: a.status, json: async () => ({ success: a.ok, favorite: body.favorite, ids: a.ids }) };
    }
    const q = new URL(url, 'https://x').searchParams;
    reads.push(q);
    log.push('read');
    const a = read(q);
    return { ok: true, status: 200, json: async () => ({ items: a.items, demo: a.demo === true, nextCursor: null }) };
  }) as unknown as typeof fetch;
});

const stars = () => screen.queryAllByTestId('library-star').map((b) => b.getAttribute('aria-pressed'));
// The star's label is the tab's name, so the tab is the „Favorites" button that is not a star.
const favoritesTab = (name = 'Favorites') => screen.getAllByRole('button', { name }).find((b) => !b.dataset.testid)!;

test('each card shows its own star from the server, and a tap saves it at once', async () => {
  await act(async () => { render(<LibraryGallery locale="en" />); });
  expect(stars()).toEqual(['false', 'true']);

  let release: () => void = () => {};
  hold = new Promise<void>((r) => { release = r; });
  await act(async () => { fireEvent.click(screen.getAllByTestId('library-star')[0]!); });
  expect(stars()).toEqual(['true', 'true']); // before the server has answered
  expect(patches).toEqual([{ id: 'f1', favorite: true }]);
  // A second tap while the first is on its way sends nothing.
  await act(async () => { fireEvent.click(screen.getAllByTestId('library-star')[0]!); });
  expect(patches).toHaveLength(1);
  await act(async () => { release(); });
  expect(stars()).toEqual(['true', 'true']);
  expect(screen.queryByTestId('library-fav-failed')).toBeNull();

  hold = null;
  await act(async () => { fireEvent.click(screen.getAllByTestId('library-star')[1]!); });
  expect(patches[1]).toEqual({ id: 'f2', favorite: false });
  expect(stars()).toEqual(['true', 'false']);
});

test('a star the server refuses goes back and says so; changing tab clears the note', async () => {
  patchAnswer = () => ({ ok: false, status: 503 });
  await act(async () => { render(<LibraryGallery locale="en" />); });
  await act(async () => { fireEvent.click(screen.getAllByTestId('library-star')[0]!); });
  expect(stars()).toEqual(['false', 'true']);
  expect(screen.getByTestId('library-fav-failed').textContent).toBe('The star could not be saved. Try again.');
  expect(screen.getByRole('alert').textContent).toBe('The star could not be saved. Try again.');

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
  expect(screen.queryByTestId('library-fav-failed')).toBeNull();
});

test('the Favorites tab pages through every starred work, and a star taken off leaves it at once', async () => {
  const starred = Array.from({ length: 13 }, (_, i) => film(`s${String(i).padStart(2, '0')}`, true));
  read = (q) => (q.get('favorite') === '1'
    ? { items: starred.slice(Number(q.get('offset')), Number(q.get('offset')) + Number(q.get('limit'))) }
    : { items: [film('f1', false)] });
  await act(async () => { render(<LibraryGallery locale="en" />); });
  await act(async () => { fireEvent.click(favoritesTab()); });
  const last = reads[reads.length - 1]!;
  expect(last.toString()).toBe('favorite=1&limit=12&offset=0'); // no kind: stars of every kind
  expect(document.querySelectorAll('video')).toHaveLength(12);
  expect(stars().every((s) => s === 'true')).toBe(true);

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Next/ })); });
  expect(reads[reads.length - 1]!.toString()).toBe('favorite=1&limit=12&offset=12');
  expect(document.querySelectorAll('video')).toHaveLength(1);

  await act(async () => { fireEvent.click(screen.getAllByTestId('library-star')[0]!); });
  expect(patches).toEqual([{ id: 's12', favorite: false }]);
  expect(document.querySelectorAll('video')).toHaveLength(0);
});

test('an empty Favorites tab says how to fill it, in ka, en and ru', async () => {
  read = (q) => ({ items: q.get('favorite') === '1' ? [] : [film('f1', false)] });
  const cases: [string, string, string][] = [
    ['en', 'Favorites', 'No favorites yet. Tap the star on a work to keep it here.'],
    ['ka', 'ფავორიტი', 'რჩეულები ჯერ ცარიელია. ნამუშევარზე ვარსკვლავს დააჭირე და აქ გამოჩნდება.'],
    ['ru', 'Избранное', 'В избранном пока пусто. Нажмите звезду на работе, и она появится здесь.'],
  ];
  for (const [locale, tab, text] of cases) {
    const view = render(<LibraryGallery locale={locale} />);
    await act(async () => {});
    await act(async () => { fireEvent.click(favoritesTab(tab)); });
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText('Nothing created yet')).toBeNull();
    view.unmount();
  }
});

test('the stars this browser kept before move to the account, and only the ones it took leave the browser', async () => {
  window.localStorage.setItem(DEVICE_FAVORITES_KEY, JSON.stringify(['f1', 'someone-elses']));
  patchAnswer = () => ({ ok: true, status: 200, ids: ['f1'] });
  read = () => ({ items: [film('f1', log.includes('saved')), film('f2', true)] }); // the server's stars, before and after
  await act(async () => { render(<LibraryGallery locale="en" />); });
  expect(patches[0]).toEqual({ ids: ['f1', 'someone-elses'], favorite: true });
  expect(JSON.parse(window.localStorage.getItem(DEVICE_FAVORITES_KEY)!)).toEqual(['someone-elses']);
  // The first read was already on its way when they moved: it is asked again, so the moved star shows.
  expect(log).toEqual(['read', 'saved', 'read']);
  expect(stars()).toEqual(['true', 'true']);
});

test('a signed-out visitor\'s demo examples have no star, and the browser\'s old stars are not sent', async () => {
  session = null;
  window.localStorage.setItem(DEVICE_FAVORITES_KEY, JSON.stringify(['f1']));
  read = () => ({ items: [film('f1')], demo: true });
  await act(async () => { render(<LibraryGallery locale="en" />); });
  expect(document.querySelectorAll('video')).toHaveLength(1);
  expect(screen.queryAllByTestId('library-star')).toHaveLength(0);
  expect(patches).toHaveLength(0);
  expect(window.localStorage.getItem(DEVICE_FAVORITES_KEY)).toBe('["f1"]');
});

// §4.2.6: the session is read after the first render; the kept view is the account's, and it is decided before any read.
test('a signed-in return opens the Favorites page it was left on, and reads nothing else', async () => {
  saveLibraryView('page', 'user-s', { tab: 'favorites', page: 1 });
  await act(async () => { render(<LibraryGallery locale="en" />); });
  expect(reads.map((q) => q.toString())).toEqual(['favorite=1&limit=12&offset=12']);
});
