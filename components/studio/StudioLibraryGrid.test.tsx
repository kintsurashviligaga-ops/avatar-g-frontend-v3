/**
 * The Library grid shows the Interior designer's 3D plan as a picture (the render it was made for) with a „3D plan" badge,
 * and opens the plan itself on request. RoomViewer is three.js, so PlanView is stubbed: this pins the card, not WebGL.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetLibraryOwnerForTests } from '../../lib/library/libraryQuery';
import { saveLibraryView } from '../../lib/library/libraryView';

// The shared save (lib/media/saveMedia), answered at once: these tests pin what the card hands it.
const mockSaveMedia = jest.fn(async (_url: string, _base: string, _opts?: unknown) => 'started');
jest.mock('../../lib/media/saveMedia', () => ({ saveMedia: (url: string, base: string, opts?: unknown) => mockSaveMedia(url, base, opts) }));
jest.mock('./create/newtools/PlanView', () => ({
  PlanView: ({ style }: { style: { styleName: string } }) => <figure data-testid="plan-ready">{style.styleName}</figure>,
}));
jest.mock('framer-motion', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const strip = ({ layout: _l, initial: _i, animate: _a, exit: _e, transition: _t, ...rest }: Record<string, unknown>) => rest;
  return {
    // One component per tag: a fresh function on every access would remount the card on each render.
    motion: new Proxy({} as Record<string, unknown>, {
      get: (cache, tag: string) => (cache[tag] ??= (p: Record<string, unknown>) => React.createElement(tag, strip(p))),
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import StudioLibraryGrid from './StudioLibraryGrid';

const PLAN = {
  id: 'plan-1', kind: 'interior', url: 'https://ours.supabase.co/storage/v1/object/sign/renders/room.png?token=t',
  prompt: 'Japandi bedroom', orientation: 'landscape', createdAt: '2026-10-10T00:00:00Z',
  plan: { geometry: { roomType: 'bedroom', floor: { widthM: 4, depthM: 3 }, wallHeightM: 2.6, walls: [], openings: [], confidence: 0.7 }, style: { styleName: 'Japandi', palette: ['#eeeeee'] } },
};
const FILM = { id: 'film-1', kind: 'film', url: 'https://cdn.example.com/f.mp4', prompt: 'a film', orientation: 'landscape', createdAt: '2026-10-09T00:00:00Z' };

beforeAll(() => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} disconnect() {} };
});
// The grid reads through the app's React Query client (lib/library/libraryQuery): a fresh one per test, its updates
// delivered at once instead of on a timer.
notifyManager.setScheduler((run) => run());
let client: QueryClient;
beforeEach(() => {
  // jsdom plays no media: a film let go (lib/library/videoPool) asks the browser to drop its file.
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  resetLibraryOwnerForTests();
  window.sessionStorage.clear();
  mockSaveMedia.mockClear();
  client = new QueryClient();
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [PLAN, FILM] }) })) as unknown as typeof fetch;
});

async function mount(locale: 'ka' | 'en' | 'ru' = 'en') {
  await act(async () => { render(<QueryClientProvider client={client}><StudioLibraryGrid locale={locale} /></QueryClientProvider>); });
}

test('a 3D plan shows as a picture with a „3D plan" badge, not as a video', async () => {
  await mount();
  const img = await screen.findByAltText('Japandi bedroom');
  expect(img.tagName).toBe('IMG');
  expect(img.getAttribute('src')).toBe(PLAN.url);
  expect(screen.getByText('3D plan')).toBeTruthy();
  expect(document.querySelectorAll('video')).toHaveLength(1); // only the film
});

test('„View 3D plan" opens the plan on the card and closes it again', async () => {
  await mount();
  const toggle = await screen.findByTestId('library-plan-toggle');
  expect(screen.queryByTestId('plan-ready')).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByTestId('plan-ready').textContent).toBe('Japandi');
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: /close plan/i }));
  expect(screen.queryByTestId('plan-ready')).toBeNull();
  expect(screen.getAllByTestId('library-plan-toggle')).toHaveLength(1); // the film has none
});

test('the plan files under Avatars · Images, not Videos', async () => {
  await mount();
  await screen.findByTestId('library-plan-toggle');
  fireEvent.click(screen.getByRole('button', { name: /^Videos/ }));
  expect(screen.queryByTestId('library-plan-toggle')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^Avatars \/ Images/ }));
  expect(screen.getByTestId('library-plan-toggle')).toBeTruthy();
});

test('Georgian copy', async () => {
  await mount('ka');
  expect(await screen.findByText('3D გეგმა')).toBeTruthy();
  expect(screen.getByText('3D გეგმის ნახვა')).toBeTruthy();
});

test('a film that will not load shows a plain message and a retry that fetches fresh links', async () => {
  await mount('ka');
  await screen.findByTestId('library-plan-toggle');
  const video = document.querySelector('video') as HTMLVideoElement;
  const before = (global.fetch as jest.Mock).mock.calls.length;
  await act(async () => { fireEvent.error(video); });
  expect(screen.getByText('ფაილი ვერ ჩაიტვირთა.')).toBeTruthy();
  expect(document.querySelectorAll('video')).toHaveLength(0);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'თავიდან ცდა' })); });
  expect((global.fetch as jest.Mock).mock.calls.length).toBe(before + 1);
});

// §4.2 (Phase 3 PR 2): the slide-over and the /library page share one data layer (lib/library/libraryQuery).
test('opening the slide-over again shows the loaded list at once and refreshes it behind the grid', async () => {
  const view = render(<QueryClientProvider client={client}><StudioLibraryGrid locale="en" /></QueryClientProvider>);
  await screen.findByTestId('library-plan-toggle');
  view.unmount();
  let release: () => void = () => {};
  global.fetch = jest.fn(() => new Promise((resolve) => {
    release = () => resolve({ ok: true, status: 200, json: async () => ({ items: [PLAN, FILM] }) });
  })) as unknown as typeof fetch;
  await mount();
  expect(global.fetch).toHaveBeenCalledTimes(1); // the refresh is out…
  expect(screen.getByAltText('Japandi bedroom')).toBeTruthy(); // …and the list is already there, no skeleton
  expect(document.querySelector('.animate-pulse')).toBeNull();
  await act(async () => { release(); });
  expect(screen.getByAltText('Japandi bedroom')).toBeTruthy();
});

// §4.2.5: the slide-over opened again used to read every film again.
test('opening the slide-over again gives a film card the same <video>, its link untouched', async () => {
  const stub = globalThis.IntersectionObserver;
  // Everything on screen: a card gives its film the link at once.
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    constructor(private cb: (e: { isIntersecting: boolean; target: Element }[]) => void) {}
    observe(target: Element) { this.cb([{ isIntersecting: true, target }]); }
    disconnect() {}
  };
  try {
    const first = render(<QueryClientProvider client={client}><StudioLibraryGrid locale="en" /></QueryClientProvider>);
    await screen.findByTestId('library-plan-toggle');
    const film = document.querySelector('video')!;
    expect(film.getAttribute('src')).toBe(`${FILM.url}#t=0.1`);
    first.unmount();
    const setAttribute = jest.spyOn(film, 'setAttribute');
    await mount();
    expect(document.querySelector('video')).toBe(film);
    expect(setAttribute).not.toHaveBeenCalledWith('src', expect.anything());
  } finally {
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = stub;
  }
});

// §4.2.6: the sheet opens again on the filter it was left on, scrolled where it was.
test('opening the slide-over again keeps its filter and scroll', async () => {
  const sheet = () => (
    <QueryClientProvider client={client}>
      <div data-testid="sheet" style={{ overflowY: 'auto' }}><StudioLibraryGrid locale="en" /></div>
    </QueryClientProvider>
  );
  let view: ReturnType<typeof render>;
  await act(async () => { view = render(sheet()); });
  await screen.findByTestId('library-plan-toggle');
  fireEvent.click(screen.getByRole('button', { name: /^Videos/ }));
  const box = screen.getByTestId('sheet');
  box.scrollTop = 260;
  box.dispatchEvent(new Event('scroll'));
  await act(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
  act(() => { view.unmount(); });
  await act(async () => { render(sheet()); });
  expect(screen.getByTestId('sheet').scrollTop).toBe(260);
  expect(screen.queryByTestId('library-plan-toggle')).toBeNull(); // still on Videos
  expect(document.querySelectorAll('video')).toHaveLength(1);
});

test('another account\'s filter is not used', async () => {
  saveLibraryView('slideover', 'user-x', { tab: 'videos' });
  await mount();
  expect(await screen.findByTestId('library-plan-toggle')).toBeTruthy(); // on All
});

// §4.3: the card hands the save the file's name and extension, when its link runs out, and a way to a fresh one.
test('Download hands the save a fresh link when the old one ran out: the list read again', async () => {
  const expiresAt = new Date(Date.now() + 20_000).toISOString();
  let round = 0;
  global.fetch = jest.fn(async () => {
    round += 1;
    const film = { ...FILM, url: `https://ours.supabase.co/storage/v1/object/sign/renders/f.mp4?token=round-${round}`, expiresAt };
    return { ok: true, status: 200, json: async () => ({ items: [film, PLAN] }) };
  }) as unknown as typeof fetch;
  await mount();
  await screen.findByTestId('library-plan-toggle');
  const reads = round;
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Download' })[0]!); });
  expect(mockSaveMedia).toHaveBeenCalledTimes(1);
  const [url, base, opts] = mockSaveMedia.mock.calls[0]! as unknown as [string, string, { fallbackExt?: string; expiresAt?: string; relink?: () => Promise<string | null> }];
  expect(url).toContain(`token=round-${reads}`);
  expect(base).toBe('myavatar-film-film-1');
  expect(opts).toMatchObject({ fallbackExt: 'mp4', expiresAt });
  let fresh: string | null = null;
  await act(async () => { fresh = await opts.relink!(); });
  expect(round).toBeGreaterThan(reads);
  expect(fresh).toBe(`https://ours.supabase.co/storage/v1/object/sign/renders/f.mp4?token=round-${round}`);
});

test('a file saved in the studio comes in with a „New" badge; what was loaded stays', async () => {
  await mount();
  await screen.findByTestId('library-plan-toggle');
  expect(screen.queryByText('New')).toBeNull();
  const SAVED = { ...FILM, id: 'film-2', url: 'https://cdn.example.com/g.mp4', prompt: 'just saved' };
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [SAVED, PLAN, FILM] }) })) as unknown as typeof fetch;
  await act(async () => { window.dispatchEvent(new Event('myavatar:library-updated')); });
  expect(document.querySelectorAll('video')).toHaveLength(2);
  expect(screen.getAllByText('New')).toHaveLength(1);
  expect(screen.getByAltText('Japandi bedroom')).toBeTruthy();
});

describe('failed, demo and the endless list (§4.2.4, §4.2.7)', () => {
  test('a failed first read says so with a retry, not „Nothing here yet"', async () => {
    let ok = false;
    global.fetch = jest.fn(async () => (ok
      ? { ok: true, status: 200, json: async () => ({ items: [FILM] }) }
      : { ok: false, status: 503, json: async () => ({ items: [], error: 'library_unavailable' }) })) as unknown as typeof fetch;
    await mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 1100)); });
    expect(screen.getByTestId('library-failed').getAttribute('data-failure')).toBe('unavailable');
    expect(screen.queryByText('Nothing here yet')).toBeNull();
    ok = true;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(screen.queryByTestId('library-failed')).toBeNull();
    expect(document.querySelectorAll('video')).toHaveLength(1);
  });

  test('the demo library is labelled as examples and its cards have no Delete', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [FILM], demo: true, nextCursor: null }) })) as unknown as typeof fetch;
    await mount();
    expect(screen.getByTestId('library-demo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  test('the next page is asked for after the cursor the last one ended on', async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      const before = new URL(url, 'https://x').searchParams.get('before');
      return { ok: true, status: 200, json: async () => (before ? { items: [PLAN], nextCursor: null } : { items: [FILM], nextCursor: 'CURSOR-1' }) };
    }) as unknown as typeof fetch;
    let seen: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) { seen = cb; }
      observe() {} disconnect() {}
    };
    try {
      await mount();
      await act(async () => { seen!([{ isIntersecting: true }]); });
      expect(urls).toEqual(['/api/studio/library?limit=24', '/api/studio/library?limit=24&before=CURSOR-1']);
      expect(await screen.findByAltText('Japandi bedroom')).toBeTruthy();
    } finally {
      (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} disconnect() {} };
    }
  });
});
