/**
 * The /library page: avatar videos sit with the films, the Interior designer's 3D plans (filed with their render) with the
 * pictures, and a plan opens on its card. RoomViewer is three.js, so PlanView is stubbed: this pins the page, not WebGL.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
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

let requested: string[] = [];
beforeEach(() => {
  requested = [];
  global.fetch = jest.fn(async (url: string) => {
    requested.push(url);
    const kind = new URL(url, 'https://x').searchParams.get('kind') ?? '';
    const items = kind.includes('interior') ? [PLAN] : kind.includes('avatar') ? [AVATAR] : [];
    return { ok: true, status: 200, json: async () => ({ items }) };
  }) as unknown as typeof fetch;
});

const kinds = () => requested.map((u) => new URL(u, 'https://x').searchParams.get('kind'));

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
