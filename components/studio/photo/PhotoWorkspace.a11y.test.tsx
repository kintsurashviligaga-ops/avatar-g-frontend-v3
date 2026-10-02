/**
 * @jest-environment jsdom
 *
 * The culling workspace for a screen reader and a phone:
 *  · one polite live region says when the analysis starts and when it is done, and when an export starts — never the
 *    per-photo counter (which used to be the live region, and spoke fifty times for fifty photos);
 *  · it is not a second role="status" (the workspace's notice is the one);
 *  · a filter that matches nothing is a friendly empty state with a way back ("Show all"), not a bare line;
 *  · the grid's last row and the dropzone clear the home indicator (env(safe-area-inset-bottom)).
 */
jest.mock('./spawnWorker', () => ({ spawnCullWorker: () => { throw new Error('no worker in tests'); } }));
jest.mock('./pipeline', () => ({
  previewPixels: () => new Promise(() => {}),
  analyzePhoto: jest.fn(),
  renderGraded: jest.fn(),
  offscreenCanvas: jest.fn(),
  domCanvas: jest.fn(),
}));
jest.mock('./exportPicks', () => ({ exportPicks: () => new Promise(() => {}) })); // an export that is still running

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { CullClient } from './cullClient';
import { PhotoWorkspace } from './PhotoWorkspace';
import { createPhotoSession } from './session';

/** analyze() settles when the test says so: the analysis is "running" until then. */
function controllableClient() {
  const pending: Array<() => void> = [];
  const client: CullClient = {
    analyze: () => new Promise((_resolve, reject) => { pending.push(() => reject(new Error('unreadable'))); }),
    render: () => Promise.reject(new Error('unused')),
    cancelPending() {},
    dispose() {},
  };
  return { client, finishAll: () => { while (pending.length) pending.shift()!(); } };
}
const file = (name: string) => new File(['x'], name, { type: 'image/jpeg', lastModified: 1 });

function setup(locale = 'en') {
  const { client, finishAll } = controllableClient();
  const session = createPhotoSession(() => client);
  render(<PhotoWorkspace locale={locale} onExit={() => {}} session={session} />);
  const add = (files: File[]) => act(() => { fireEvent.change(screen.getByTestId('photo-input'), { target: { files } }); });
  return { session, add, finishAll };
}
const live = () => screen.getByTestId('photo-live');

it('announces the analysis starting and finishing — once each, not per photo', async () => {
  const { add, finishAll } = setup();
  expect(live().textContent).toBe(''); // mounted, silent, before there is news
  expect(live().getAttribute('aria-live')).toBe('polite');
  add([file('1.jpg'), file('2.jpg'), file('3.jpg')]);
  expect(live().textContent).toBe('Analysing… 0/3');
  // The visible counter is no live region any more.
  expect(screen.getByText('Analysing… 0/3', { selector: 'header p' }).getAttribute('aria-live')).toBeNull();
  await act(async () => { finishAll(); await Promise.resolve(); });
  expect(live().textContent).toBe('Analysis done — 3 photos');
});

it('announces an export starting; the outcome stays with the one role="status" notice', async () => {
  const { add, session } = setup();
  add([file('1.jpg')]);
  act(() => { session.setStatus(session.get().items[0]!.id, 'pick'); });
  await act(async () => { fireEvent.click(screen.getByTestId('export-picks')); });
  expect(live().textContent).toBe('Exporting… 0/1');
  expect(screen.queryAllByRole('status').every((el) => el !== live())).toBe(true);
});

it('a filter that matches nothing offers the way back', () => {
  const { add } = setup();
  add([file('1.jpg'), file('2.jpg')]);
  fireEvent.click(screen.getByRole('button', { name: /^Picks/ }));
  expect(screen.getByTestId('photo-filter-empty').textContent).toContain('No photos in this filter');
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  expect(screen.queryByTestId('photo-filter-empty')).toBeNull();
  expect(screen.getByTestId('photo-grid')).toBeTruthy();
});

it.each([
  ['ka', 'ყველას ჩვენება'],
  ['ru', 'Показать все'],
])('the empty filter speaks %s', (locale, showAll) => {
  const { add } = setup(locale);
  add([file('1.jpg')]);
  fireEvent.click(screen.getAllByRole('button', { pressed: false }).find((b) => /^(რჩეული|Отобранные)/.test(b.textContent ?? ''))!);
  expect(screen.getByRole('button', { name: showAll })).toBeTruthy();
});

it('the grid and the dropzone clear the home indicator', () => {
  const { add } = setup();
  expect(screen.getByTestId('photo-dropzone').parentElement!.className).toContain('env(safe-area-inset-bottom)');
  add([file('1.jpg')]);
  const shoot = screen.getByTestId('photo-grid').closest('section')!;
  expect(shoot.className).toContain('pb-[calc(1.5rem+env(safe-area-inset-bottom))]');
});
