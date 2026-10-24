/**
 * The Library grid shows the Interior designer's 3D plan as a picture (the render it was made for) with a „3D plan" badge,
 * and opens the plan itself on request. RoomViewer is three.js, so PlanView is stubbed: this pins the card, not WebGL.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetLibraryOwnerForTests } from '../../lib/library/libraryQuery';

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
  resetLibraryOwnerForTests();
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
