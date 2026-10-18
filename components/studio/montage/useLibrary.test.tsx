/**
 * Montage „My creations" (useLibrary + MediaPicker) reaches every file of the person's Library, not just the newest 36.
 * GG 2026-10-18: „yesterday's and older files do not go into the montage" — each kind was read once (24 rows) and the
 * merge kept 36, so older films were out of reach. Pinned: one newest-first list, „Show more" for the next page, a
 * Videos / Photos filter, and no 3D model offered as a clip.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('../ui/useSignedIn', () => ({ useSignedIn: () => ({ authed: true, userId: 'u1' }) }));

import { MediaPicker } from './MediaPicker';
import { LIBRARY_PAGE, libraryKinds, useLibrary, type LibraryItem, type LibraryScope } from './useLibrary';
import { montageCopy } from './copy';

const t = montageCopy('en');
const day = (n: number) => new Date(Date.UTC(2026, 9, 18) - n * 3600_000).toISOString();
/** 40 pictures from today (26 images, 14 interior renders), then yesterday's film, then a 3D model: the old picker's 36
 *  newest left the film out; here it is on the second page. */
const ROWS: LibraryItem[] = [
  ...Array.from({ length: 40 }, (_, i) => ({ id: `img_${i}`, kind: i % 3 === 2 ? 'interior' : 'image', url: `https://ours.supabase.co/storage/v1/object/sign/renders/p${i}.png?token=t`, prompt: `picture ${i}`, orientation: 'landscape' as const, createdAt: day(i / 10) })),
  { id: 'film_old', kind: 'film', url: 'https://ours.supabase.co/storage/v1/object/sign/uploads/films/old.mp4?token=t', prompt: 'Yesterday film', orientation: 'landscape', createdAt: day(26) },
  { id: 'glb_1', kind: 'image', url: 'https://ours.supabase.co/storage/v1/object/sign/renders/chair.glb?token=t', prompt: 'a chair', orientation: 'landscape', createdAt: day(30) },
];

let asked: URL[] = [];
beforeEach(() => {
  asked = [];
  global.fetch = jest.fn(async (u: string) => {
    const url = new URL(u, 'https://x');
    asked.push(url);
    const kinds = (url.searchParams.get('kind') ?? '').split(',');
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 40);
    const items = ROWS.filter((r) => kinds.includes(r.kind)).slice(offset, offset + limit);
    return { ok: true, json: async () => ({ items }) };
  }) as unknown as typeof fetch;
});

function Harness({ scope = 'visual', onAdd = () => {} }: { scope?: LibraryScope; onAdd?: (items: LibraryItem[]) => void }) {
  const library = useLibrary(scope, true);
  return <MediaPicker t={t} library={library} onDevice={() => {}} onAdd={onAdd} />;
}

const tiles = () => screen.getByTestId('montage-my-creations').querySelectorAll('button[aria-pressed]');

test('an older film is one „Show more" away, and lands like any other pick', async () => {
  const onAdd = jest.fn();
  await act(async () => { render(<Harness onAdd={onAdd} />); });
  expect(asked.map((u) => [u.searchParams.get('kind'), u.searchParams.get('offset')])).toEqual([['film,avatar,image,interior', '0']]);
  expect(tiles()).toHaveLength(LIBRARY_PAGE);
  expect(screen.queryByRole('button', { name: /Yesterday film/ })).toBeNull();

  await act(async () => { fireEvent.click(screen.getByTestId('montage-library-more')); });
  expect(asked[1]?.searchParams.get('offset')).toBe(String(LIBRARY_PAGE));
  // The rest of the pictures and the film; the 3D model is no clip, and the list has ended.
  expect(tiles()).toHaveLength(40 + 1);
  expect(screen.queryByRole('button', { name: /a chair/ })).toBeNull();
  expect(screen.queryByTestId('montage-library-more')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /Yesterday film/ }));
  fireEvent.click(screen.getByTestId('montage-add-picked'));
  expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ id: 'film_old' })]);
});

test('the Videos filter goes straight to the films, Photos to the pictures', async () => {
  await act(async () => { render(<Harness />); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Videos' })); });
  expect(asked.at(-1)?.searchParams.get('kind')).toBe('film,avatar');
  expect(tiles()).toHaveLength(1);
  expect(screen.getByRole('button', { name: /Yesterday film/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Videos' }).getAttribute('aria-pressed')).toBe('true');

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Photos' })); });
  expect(asked.at(-1)?.searchParams.get('kind')).toBe('image,interior');
  expect(asked.at(-1)?.searchParams.get('offset')).toBe('0');
  expect(tiles()).toHaveLength(LIBRARY_PAGE);
  expect(screen.getByTestId('montage-library-more')).toBeTruthy();
});

test('the kind list per scope and filter', () => {
  expect(libraryKinds('visual', 'all')).toBe('film,avatar,image,interior');
  expect(libraryKinds('visual', 'video')).toBe('film,avatar');
  expect(libraryKinds('visual', 'photo')).toBe('image,interior');
  expect(libraryKinds('music', 'all')).toBe('music');
});
