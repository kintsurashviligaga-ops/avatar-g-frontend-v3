/**
 * The /library page: avatar videos sit with the films, the Interior designer's 3D plans (filed with their render) with the
 * pictures, and a plan opens on its card. RoomViewer is three.js, so PlanView is stubbed: this pins the page, not WebGL.
 */
import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { resetLibraryOwnerForTests } from '../../lib/library/libraryQuery';
import { readLibraryView, saveLibraryView } from '../../lib/library/libraryView';

const push = jest.fn();
let mockSearch = new URLSearchParams();
jest.mock('next/navigation', () => ({ useSearchParams: () => mockSearch, useRouter: () => ({ push }) }));
// The shared save (lib/media/saveMedia), held open until a test lets it finish.
let finishSave: () => void = () => {};
const mockSaveMedia = jest.fn((_url: string, _base: string, _opts?: { fallbackExt?: string }) => new Promise<string>((done) => { finishSave = () => done('downloaded'); }));
jest.mock('../../lib/media/saveMedia', () => ({ saveMedia: (url: string, base: string, opts?: { fallbackExt?: string }) => mockSaveMedia(url, base, opts) }));
jest.mock('../studio/create/newtools/PlanView', () => ({
  PlanView: ({ style }: { style: { styleName: string } }) => <figure data-testid="plan-ready">{style.styleName}</figure>,
}));

import LibraryGallery from './LibraryGallery';

// The page reads through the app's React Query client (lib/library/libraryQuery): a fresh one per test, its updates
// delivered at once instead of on a timer, so a test sees what one act() brings.
notifyManager.setScheduler((run) => run());
let client: QueryClient;
function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

const PLAN = {
  id: 'plan-1', kind: 'interior', url: 'https://ours.supabase.co/storage/v1/object/sign/renders/room.png?token=t',
  prompt: 'Japandi bedroom', orientation: 'landscape', createdAt: '2026-10-10T00:00:00Z',
  plan: { geometry: { roomType: 'bedroom', floor: { widthM: 4, depthM: 3 }, wallHeightM: 2.6, walls: [], openings: [], confidence: 0.7 }, style: { styleName: 'Japandi', palette: ['#eeeeee'] } },
};
const AVATAR = { id: 'av-1', kind: 'avatar', url: 'https://cdn.example.com/a.mp4', prompt: 'talking avatar', orientation: 'landscape', createdAt: '2026-10-09T00:00:00Z' };
const MODEL = { id: 'glb-1', kind: 'image', url: 'https://ours.supabase.co/storage/v1/object/sign/renders/chair.glb?token=t', prompt: 'a chair', orientation: 'landscape', createdAt: '2026-10-08T00:00:00Z' };
const SONG = { id: 'song-1', kind: 'music', url: 'https://ours.supabase.co/storage/v1/object/sign/renders/s.mp3?token=t', prompt: 'a Tbilisi song', orientation: 'landscape', createdAt: '2026-10-07T00:00:00Z' };

let requested: string[] = [];
beforeEach(() => {
  // jsdom plays no media: a film let go (lib/library/videoPool) asks the browser to drop its file.
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  resetLibraryOwnerForTests();
  client = new QueryClient();
  requested = [];
  push.mockReset();
  mockSaveMedia.mockClear();
  window.sessionStorage.clear();
  mockSearch = new URLSearchParams();
  global.fetch = jest.fn(async (url: string) => {
    requested.push(url);
    const kind = new URL(url, 'https://x').searchParams.get('kind') ?? '';
    const items = kind.includes('interior') ? [PLAN, MODEL] : kind.includes('avatar') ? [AVATAR] : kind === 'music' ? [SONG] : [];
    return { ok: true, status: 200, json: async () => ({ items }) };
  }) as unknown as typeof fetch;
});

const kinds = () => requested.map((u) => new URL(u, 'https://x').searchParams.get('kind'));

// Deliberately let a cancelled transport settle late: abort is best effort, so
// obsolete responses must still leave the current tab alone.
function delayedLibraryRequests() {
  const calls: { signal?: AbortSignal | null; resolve: (items: unknown[]) => void }[] = [];
  global.fetch = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve) => {
    calls.push({ signal: init?.signal, resolve: (items) => resolve({ ok: true, json: async () => ({ items }) } as Response) });
  })) as unknown as typeof fetch;
  return calls;
}

test('rapid tab changes cancel obsolete requests while the newest request remains active', async () => {
  const calls = delayedLibraryRequests();
  await act(async () => { render(<LibraryGallery locale="en" />); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Music$/ })); });
  expect(calls).toHaveLength(3);
  expect(calls[0]!.signal?.aborted).toBe(true);
  expect(calls[1]!.signal?.aborted).toBe(true);
  expect(calls[2]!.signal?.aborted).toBe(false);
  await act(async () => { calls[2]!.resolve([SONG]); });
  expect(document.querySelector('audio')?.getAttribute('src')).toBe(SONG.url);
  await act(async () => { calls[1]!.resolve([PLAN]); calls[0]!.resolve([AVATAR]); });
  expect(document.querySelector('audio')?.getAttribute('src')).toBe(SONG.url);
  expect(document.querySelector('video')).toBeNull();
});

test('late obsolete responses cannot replace the current tab, and leaving releases its request', async () => {
  const calls = delayedLibraryRequests();
  let view: ReturnType<typeof render>;
  await act(async () => { view = render(<LibraryGallery locale="en" />); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
  await act(async () => { calls[1]!.resolve([PLAN]); });
  await act(async () => { calls[0]!.resolve([AVATAR]); });
  expect(screen.getByAltText(PLAN.prompt)).toBeTruthy();
  expect(document.querySelector('video')).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Music$/ })); });
  view!.unmount();
  expect(calls[2]!.signal?.aborted).toBe(true);
});

test('the Video tab asks for films and avatar videos; the Image tab for pictures and 3D plans', async () => {
  await act(async () => { render(<LibraryGallery locale="en" />); });
  expect(kinds()).toEqual(['film,avatar']);
  expect(document.querySelector('video')?.getAttribute('src')).toBe(`${AVATAR.url}#t=0.1`);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
  expect(kinds()).toEqual(['film,avatar', 'image,interior']);
});

// §4.2.5: switching tabs used to rebuild every film card, and each new <video> read its file again.
test('a film tab that comes back shows the same <video>, its link untouched: nothing is read again', async () => {
  await act(async () => { render(<LibraryGallery locale="en" />); });
  const film = document.querySelector('video')!;
  expect(film.getAttribute('src')).toBe(`${AVATAR.url}#t=0.1`);
  const setAttribute = jest.spyOn(film, 'setAttribute');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
  expect(document.querySelector('video')).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Video$/ })); });
  expect(document.querySelector('video')).toBe(film);
  expect(film.getAttribute('src')).toBe(`${AVATAR.url}#t=0.1`);
  expect(setAttribute).not.toHaveBeenCalledWith('src', expect.anything());
  expect(film.controls).toBe(true);
});

test('a 3D plan shows its render with a „3D plan" badge and opens on the card', async () => {
  await act(async () => { render(<LibraryGallery locale="en" />); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
  expect(screen.getByAltText('Japandi bedroom').getAttribute('src')).toBe(PLAN.url);
  expect(screen.getByText('3D plan')).toBeTruthy();
  const toggle = screen.getByTestId('library-plan-toggle');
  expect(screen.queryByTestId('plan-ready')).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByTestId('plan-ready').textContent).toBe('Japandi');
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: /close plan/i }));
  expect(screen.queryByTestId('plan-ready')).toBeNull();
});

test('Georgian and Russian copy', async () => {
  const { unmount } = render(<LibraryGallery locale="ka" />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /სურათი/ })); });
  expect(screen.getByText('3D გეგმის ნახვა')).toBeTruthy();
  unmount();
  render(<LibraryGallery locale="ru" />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Фото/ })); });
  expect(screen.getByText('Открыть 3D-план')).toBeTruthy();
});

// Live 2026-10-18: expired links made the browser show "Unable to play media" on Library videos. A file that will not
// load now fetches the page again once (fresh links) and, if it still fails, says so in words with a retry.
test('a video that will not load: one quiet refetch, then a plain message with a retry', async () => {
  await act(async () => { render(<LibraryGallery locale="ka" />); });
  expect(requested).toHaveLength(1);
  await act(async () => { fireEvent.error(document.querySelector('video') as HTMLVideoElement); });
  expect(requested).toHaveLength(2); // the quiet refetch: fresh links for the whole page
  expect(document.querySelector('video')).toBeTruthy(); // the refetched item gets another chance
  await act(async () => { fireEvent.error(document.querySelector('video') as HTMLVideoElement); });
  expect(requested).toHaveLength(2); // no refetch loop
  expect(screen.getByTestId('media-unavailable').textContent).toContain('ფაილი ვერ ჩაიტვირთა.');
  expect(document.querySelector('video')).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /თავიდან ცდა/ })); });
  expect(requested).toHaveLength(3);
  expect(screen.queryByTestId('media-unavailable')).toBeNull();
});

// GG's UI/UX plan (2026-10-18): the Library edits too. The file opens in the studio's editor (lib/studio/pendingEdit),
// carried in this tab's sessionStorage, never in the address bar.
test('„edit" carries a video, a picture or a song to the studio editor; a 3D model has none', async () => {
  await act(async () => { render(<LibraryGallery locale="en" />); });
  fireEvent.click(screen.getByRole('button', { name: 'Open in Editor' }));
  expect(push).toHaveBeenCalledWith('/en/dashboard');
  expect(JSON.parse(window.sessionStorage.getItem('myavatar:pending-edit') ?? '{}')).toMatchObject({ url: AVATAR.url, kind: 'video' });
  expect(push.mock.calls[0][0]).not.toContain('cdn.example.com');

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
  // The 3D plan's render edits as a picture; the .glb model (filed as an image) offers no editor.
  expect(screen.getAllByTestId('library-edit')).toHaveLength(1);
  fireEvent.click(screen.getByTestId('library-edit'));
  expect(JSON.parse(window.sessionStorage.getItem('myavatar:pending-edit') ?? '{}')).toMatchObject({ url: PLAN.url, kind: 'image' });

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Music$/ })); });
  fireEvent.click(screen.getByTestId('library-edit'));
  expect(JSON.parse(window.sessionStorage.getItem('myavatar:pending-edit') ?? '{}')).toMatchObject({ url: SONG.url, kind: 'audio' });
});

test('the edit button speaks Georgian and Russian', async () => {
  const { unmount } = render(<LibraryGallery locale="ka" />);
  await act(async () => { /* the page's first fetch */ });
  expect(screen.getByRole('button', { name: 'რედაქტირება ედიტორში' })).toBeTruthy();
  unmount();
  render(<LibraryGallery locale="ru" />);
  await act(async () => { /* the page's first fetch */ });
  expect(screen.getByRole('button', { name: 'Открыть в редакторе' })).toBeTruthy();
});

// GG 2026-10-18: „Download saves sometimes and sometimes not". The page had its own older save (share sheet after the
// whole file had loaded, then a new tab); it now goes through the chat's save, once per tap, and shows it is working.
test('Download saves through the shared save, once, and the button is busy until the file is out', async () => {
  await act(async () => { render(<LibraryGallery locale="en" />); });
  const button = screen.getByTestId('library-download');
  await act(async () => { fireEvent.click(button); });
  await act(async () => { fireEvent.click(button); }); // a second, impatient tap
  expect(mockSaveMedia).toHaveBeenCalledTimes(1);
  expect(mockSaveMedia).toHaveBeenCalledWith(AVATAR.url, 'myavatar-avatar-av-1', expect.objectContaining({ fallbackExt: 'mp4' }));
  expect(button).toHaveProperty('disabled', true);
  expect(button.getAttribute('aria-busy')).toBe('true');
  await act(async () => { finishSave(); });
  expect(button).toHaveProperty('disabled', false);
  expect(button.getAttribute('aria-busy')).toBeNull();

  // A song keeps its own extension when the bytes do not say; a 3D model downloads as .glb.
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Music$/ })); });
  await act(async () => { fireEvent.click(screen.getByTestId('library-download')); finishSave(); });
  expect(mockSaveMedia).toHaveBeenLastCalledWith(SONG.url, 'myavatar-music-song-1', expect.objectContaining({ fallbackExt: 'mp3' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
  await act(async () => { fireEvent.click(screen.getAllByTestId('library-download')[1]!); finishSave(); });
  expect(mockSaveMedia).toHaveBeenLastCalledWith(MODEL.url, 'myavatar-image-glb-1', expect.objectContaining({ fallbackExt: 'glb' }));
});

// §4.3: a link that ran out is signed afresh. The save is handed when the link runs out, and a way to get the work's new
// link: the page read again, as on any refresh. Nothing is generated or written.
test('a Download whose link ran out gets the work\'s fresh link from the page read again', async () => {
  const expiresAt = new Date(Date.now() + 20_000).toISOString();
  let round = 0;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    requested.push(`${init?.method ?? 'GET'} ${url}`);
    round += 1;
    const link = `https://ours.supabase.co/storage/v1/object/sign/renders/a.mp4?token=round-${round}`;
    return { ok: true, status: 200, json: async () => ({ items: [{ ...AVATAR, url: link, expiresAt }] }) };
  }) as unknown as typeof fetch;
  await act(async () => { render(<LibraryGallery locale="en" />); });
  const before = requested.length;
  await act(async () => { fireEvent.click(screen.getByTestId('library-download')); });
  const [url, , opts] = mockSaveMedia.mock.calls[0]! as unknown as [string, string, { expiresAt?: string; relink?: () => Promise<string | null> }];
  expect(opts.expiresAt).toBe(expiresAt);
  let fresh: string | null = null;
  await act(async () => { fresh = await opts.relink!(); });
  expect(fresh).not.toBeNull();
  expect(fresh).not.toBe(url);
  expect(fresh).toBe(`https://ours.supabase.co/storage/v1/object/sign/renders/a.mp4?token=round-${round}`);
  expect(requested.slice(before).every((r) => r.startsWith('GET /api/studio/library?'))).toBe(true);
  await act(async () => { finishSave(); });
});

// §4.2 (Phase 3 PR 2): a warm tab switch shows the tab at once, never a blank spinner, and sends nothing while it is
// current. The before table (docs/master-v3.1/PERFORMANCE_PHASE3.md) had every return blank the grid and refetch.
test('going back to a tab already loaded shows it at once: no spinner, no request', async () => {
  await act(async () => { render(<LibraryGallery locale="en" />); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
  expect(kinds()).toEqual(['film,avatar', 'image,interior']);
  act(() => { fireEvent.click(screen.getByRole('button', { name: /^Video$/ })); });
  expect(document.querySelector('.py-20 .animate-spin')).toBeNull();
  expect(document.querySelector('video')?.getAttribute('src')).toBe(`${AVATAR.url}#t=0.1`);
  await act(async () => {});
  expect(kinds()).toEqual(['film,avatar', 'image,interior']);
});

// §4.2.6: a return (back from Montage, a reload of the tab) finds the page as it was left, not on the first tab.
describe('where the page was left', () => {
  const offsets = () => requested.map((u) => new URL(u, 'https://x').searchParams.get('offset'));
  const active = (name: RegExp) => screen.getByRole('button', { name }).className.includes('bg-app-accent');

  test('the tab and the search come back, and only that tab is read', async () => {
    let view: ReturnType<typeof render>;
    await act(async () => { view = render(<LibraryGallery locale="en" />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Music$/ })); });
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'Tbilisi' } });
    act(() => { view.unmount(); });
    const before = requested.length;
    await act(async () => { render(<LibraryGallery locale="en" />); });
    expect(active(/^Music$/)).toBe(true);
    expect((screen.getByPlaceholderText('Search…') as HTMLInputElement).value).toBe('Tbilisi');
    expect(kinds().slice(before)).toEqual(['music']);
    expect(document.querySelector('audio')?.getAttribute('src')).toBe(SONG.url);
  });

  test('a kept page is the first and only read, before the session is even known', async () => {
    saveLibraryView('page', 'guest', { tab: 'image', page: 1 });
    await act(async () => { render(<LibraryGallery locale="en" />); });
    expect(kinds()).toEqual(['image,interior']);
    expect(offsets()).toEqual(['12']);
    expect(active(/^Image$/)).toBe(true);
  });

  test('the sidebar\'s ?tab= link wins over the kept view', async () => {
    saveLibraryView('page', 'guest', { tab: 'music', page: 2, q: 'sea' });
    mockSearch = new URLSearchParams('tab=image');
    await act(async () => { render(<LibraryGallery locale="en" />); });
    expect(kinds()).toEqual(['image,interior']);
    expect(offsets()).toEqual(['0']);
    expect((screen.getByPlaceholderText('Search…') as HTMLInputElement).value).toBe('');
    expect(readLibraryView('page', 'guest')).toMatchObject({ tab: 'image', page: 0, q: '' });
  });

  test('another account\'s view, or a broken one, is not used', async () => {
    saveLibraryView('page', 'user-x', { tab: 'music', q: 'sea' });
    await act(async () => { render(<LibraryGallery locale="en" />); });
    expect(kinds()).toEqual(['film,avatar']);
    expect(readLibraryView('page', 'user-x')).toBeNull(); // the page now keeps this visitor's view
  });

  test('stored nonsense is ignored', async () => {
    window.sessionStorage.setItem('myavatar:library-view', JSON.stringify({ page: { owner: 'guest', tab: 'films!', page: -3, q: 5 } }));
    await act(async () => { render(<LibraryGallery locale="en" />); });
    expect(kinds()).toEqual(['film,avatar']);
    expect(offsets()).toEqual(['0']);
    expect((screen.getByPlaceholderText('Search…') as HTMLInputElement).value).toBe('');
  });

  test('the scroll comes back once the tab is on screen', async () => {
    saveLibraryView('page', 'guest', { tab: 'music', scroll: 700 });
    await act(async () => {
      render(<div data-testid="shell" style={{ overflowY: 'auto' }}><LibraryGallery locale="en" /></div>);
    });
    expect(screen.getByTestId('shell').scrollTop).toBe(700);
    expect(active(/^Music$/)).toBe(true);
  });
});

test('a tab older than 30 s stays on screen while it is refreshed behind it', async () => {
  const now = jest.spyOn(Date, 'now');
  let clock = Date.parse('2026-10-24T06:00:00Z');
  now.mockImplementation(() => clock);
  try {
    await act(async () => { render(<LibraryGallery locale="en" />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
    clock += 31_000;
    const calls = delayedLibraryRequests();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /^Video$/ })); });
    expect(calls).toHaveLength(1); // the refresh went out…
    expect(document.querySelector('.py-20 .animate-spin')).toBeNull(); // …behind the grid, which never blanked
    expect(document.querySelector('video')?.getAttribute('src')).toBe(`${AVATAR.url}#t=0.1`);
    const NEWER = { ...AVATAR, id: 'av-2', url: 'https://cdn.example.com/b.mp4' };
    await act(async () => { calls[0]!.resolve([NEWER, AVATAR]); });
    expect([...document.querySelectorAll('video')].map((v) => v.getAttribute('src'))).toEqual([`${NEWER.url}#t=0.1`, `${AVATAR.url}#t=0.1`]);
  } finally {
    now.mockRestore();
  }
});

test('a failed request is not kept as „nothing created": the next visit asks again', async () => {
  global.fetch = jest.fn(async (url: string) => {
    requested.push(url);
    return { ok: false, status: 503, json: async () => ({}) };
  }) as unknown as typeof fetch;
  await act(async () => { render(<LibraryGallery locale="en" />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 1100)); }); // its one quiet retry
  expect(requested).toHaveLength(2);
  // It says the Library could not be reached, not that there is nothing in it (§4.2.7).
  expect(screen.getByTestId('library-failed').getAttribute('data-failure')).toBe('unavailable');
  expect(screen.getByText('The Library is not reachable right now.')).toBeTruthy();
  expect(screen.getByText('Your works are safe.')).toBeTruthy();
  expect(screen.queryByText('Nothing created yet')).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Video$/ })); });
  expect(kinds().filter((k) => k === 'film,avatar').length).toBeGreaterThan(2); // asked again, not served an empty cache
});

test('a deleted file leaves the page at once, and the page asks for what moved up on the next visit', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  try {
    await act(async () => { render(<LibraryGallery locale="en" />); });
    expect(document.querySelectorAll('video')).toHaveLength(1);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })); });
    expect(requested.at(-1)).toContain(`id=${AVATAR.id}`);
    expect(document.querySelectorAll('video')).toHaveLength(0);
    const before = requested.length;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Video$/ })); });
    expect(requested.slice(before).map((u) => new URL(u, 'https://x').searchParams.get('kind'))).toEqual(['image,interior', 'film,avatar']);
  } finally {
    confirm.mockRestore();
  }
});

describe('empty, demo, unavailable and failed are told apart (§4.2.7)', () => {
  const answerWith = (fn: (url: string) => { ok: boolean; status: number; body?: unknown } | 'offline') => {
    global.fetch = jest.fn(async (url: string) => {
      requested.push(url);
      const a = fn(url);
      if (a === 'offline') throw new TypeError('Failed to fetch');
      return { ok: a.ok, status: a.status, json: async () => a.body ?? {} };
    }) as unknown as typeof fetch;
  };
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 1100)); }); // the one quiet retry

  test('a 500 says it failed; offline says it could not be reached; Try again recovers', async () => {
    let mode: 'fail' | 'offline' | 'ok' = 'fail';
    answerWith(() => (mode === 'fail' ? { ok: false, status: 500 } : mode === 'offline' ? 'offline' : { ok: true, status: 200, body: { items: [AVATAR] } }));
    await act(async () => { render(<LibraryGallery locale="en" />); });
    await settle();
    expect(screen.getByTestId('library-failed').getAttribute('data-failure')).toBe('failed');
    expect(screen.getByText('The Library could not be loaded.')).toBeTruthy();

    mode = 'offline';
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    await settle();
    expect(screen.getByTestId('library-failed').getAttribute('data-failure')).toBe('unavailable');

    mode = 'ok';
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(screen.queryByTestId('library-failed')).toBeNull();
    expect(document.querySelector('video')?.getAttribute('src')).toBe(`${AVATAR.url}#t=0.1`);
  });

  test('a refresh that fails behind a loaded tab keeps the tab on screen', async () => {
    let fail = false;
    answerWith(() => (fail ? { ok: false, status: 503 } : { ok: true, status: 200, body: { items: [AVATAR] } }));
    await act(async () => { render(<LibraryGallery locale="en" />); });
    fail = true;
    await act(async () => { await client.invalidateQueries({ queryKey: ['library'] }); });
    await settle();
    expect(document.querySelectorAll('video')).toHaveLength(1);
    expect(screen.queryByTestId('library-failed')).toBeNull();
  });

  test('the demo library is labelled as examples, offers sign-in, and has no Delete', async () => {
    answerWith(() => ({ ok: true, status: 200, body: { items: [AVATAR], demo: true } }));
    const onAuth = jest.fn();
    window.addEventListener('myavatar:auth-required', onAuth);
    try {
      await act(async () => { render(<LibraryGallery locale="en" />); });
      expect(screen.getByTestId('library-demo').textContent).toContain('These are examples. Sign in to see your own works.');
      expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(onAuth).toHaveBeenCalledTimes(1);
      expect((onAuth.mock.calls[0]![0] as CustomEvent).detail).toBe('login');
    } finally {
      window.removeEventListener('myavatar:auth-required', onAuth);
    }
  });

  test('a signed-out visitor with no demo works is asked to sign in, not told they made nothing', async () => {
    answerWith(() => ({ ok: true, status: 200, body: { items: [], demo: true } }));
    await act(async () => { render(<LibraryGallery locale="en" />); });
    expect(screen.getByTestId('library-guest').textContent).toContain('Sign in to see your works.');
    expect(screen.queryByText('Nothing created yet')).toBeNull();
  });

  test('an account with nothing in it still says so', async () => {
    answerWith(() => ({ ok: true, status: 200, body: { items: [], demo: false } }));
    await act(async () => { render(<LibraryGallery locale="en" />); });
    expect(screen.getByText('Nothing created yet')).toBeTruthy();
    expect(screen.queryByTestId('library-failed')).toBeNull();
    expect(screen.queryByTestId('library-demo')).toBeNull();
  });

  test('Georgian and Russian copy for a failure and for the demo', async () => {
    answerWith(() => ({ ok: false, status: 500 }));
    let view: ReturnType<typeof render>;
    await act(async () => { view = render(<LibraryGallery locale="ka" />); });
    await settle();
    expect(screen.getByText('ბიბლიოთეკა ვერ ჩაიტვირთა.')).toBeTruthy();
    expect(screen.getByText('შენი ნამუშევრები შენახულია.')).toBeTruthy();
    view!.unmount();
    client = new QueryClient();
    answerWith(() => ({ ok: true, status: 200, body: { items: [AVATAR], demo: true } }));
    await act(async () => { render(<LibraryGallery locale="ru" />); });
    expect(screen.getByTestId('library-demo').textContent).toContain('Это примеры. Войдите, чтобы увидеть свои работы.');
  });
});
