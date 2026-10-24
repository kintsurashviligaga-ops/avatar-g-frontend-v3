/**
 * The /library page: avatar videos sit with the films, the Interior designer's 3D plans (filed with their render) with the
 * pictures, and a plan opens on its card. RoomViewer is three.js, so PlanView is stubbed: this pins the page, not WebGL.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push }) }));
// The shared save (lib/media/saveMedia), held open until a test lets it finish.
let finishSave: () => void = () => {};
const mockSaveMedia = jest.fn((_url: string, _base: string, _opts?: { fallbackExt?: string }) => new Promise<string>((done) => { finishSave = () => done('downloaded'); }));
jest.mock('../../lib/media/saveMedia', () => ({ saveMedia: (url: string, base: string, opts?: { fallbackExt?: string }) => mockSaveMedia(url, base, opts) }));
jest.mock('../studio/create/newtools/PlanView', () => ({
  PlanView: ({ style }: { style: { styleName: string } }) => <figure data-testid="plan-ready">{style.styleName}</figure>,
}));

import LibraryGallery from './LibraryGallery';

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
  requested = [];
  push.mockReset();
  mockSaveMedia.mockClear();
  window.sessionStorage.clear();
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
  expect(mockSaveMedia).toHaveBeenCalledWith(AVATAR.url, 'myavatar-avatar-av-1', { fallbackExt: 'mp4' });
  expect(button).toHaveProperty('disabled', true);
  expect(button.getAttribute('aria-busy')).toBe('true');
  await act(async () => { finishSave(); });
  expect(button).toHaveProperty('disabled', false);
  expect(button.getAttribute('aria-busy')).toBeNull();

  // A song keeps its own extension when the bytes do not say; a 3D model downloads as .glb.
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Music$/ })); });
  await act(async () => { fireEvent.click(screen.getByTestId('library-download')); finishSave(); });
  expect(mockSaveMedia).toHaveBeenLastCalledWith(SONG.url, 'myavatar-music-song-1', { fallbackExt: 'mp3' });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Image$/ })); });
  await act(async () => { fireEvent.click(screen.getAllByTestId('library-download')[1]!); finishSave(); });
  expect(mockSaveMedia).toHaveBeenLastCalledWith(MODEL.url, 'myavatar-image-glb-1', { fallbackExt: 'glb' });
});
