/**
 * @jest-environment jsdom
 *
 * The culling workspace as a user meets it: the privacy promise up front, photos in by the picker, P / X / U on the
 * keyboard (and never on ⌘P or inside a slider), the filters, and an export that only ever takes the picks.
 */
jest.mock('./spawnWorker', () => ({ spawnCullWorker: () => { throw new Error('no worker in tests'); } }));
jest.mock('./pipeline', () => ({
  previewPixels: () => new Promise(() => {}), // the preview stays loading; jsdom has no canvas
  analyzePhoto: jest.fn(),
  renderGraded: jest.fn(),
  offscreenCanvas: jest.fn(),
  domCanvas: jest.fn(),
}));
const exportSpy = jest.fn(async (picks: unknown[]) => ({ zips: 1, files: 0, ungraded: [], downscaled: 0, zipFailed: false, n: picks.length }));
jest.mock('./exportPicks', () => ({ exportPicks: (...a: unknown[]) => exportSpy(...(a as [unknown[]])) }));

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { CullClient } from './cullClient';
import { PhotoWorkspace } from './PhotoWorkspace';
import { createPhotoSession, type PhotoSession } from './session';

const idle: CullClient = {
  analyze: () => new Promise(() => {}),
  render: () => Promise.reject(new Error('unused')),
  cancelPending() {},
  dispose() {},
};

const file = (name: string, type = 'image/jpeg') => new File(['x'], name, { type, lastModified: 1 });

function setup(locale = 'en', session: PhotoSession = createPhotoSession(() => idle)) {
  const onExit = jest.fn();
  const utils = render(<PhotoWorkspace locale={locale} onExit={onExit} session={session} />);
  const add = (files: File[]) => act(() => { fireEvent.change(screen.getByTestId('photo-input'), { target: { files } }); });
  return { ...utils, onExit, session, add };
}

const cellNames = () => within(screen.getByTestId('photo-grid')).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '');

beforeEach(() => exportSpy.mockClear());

describe('PhotoWorkspace', () => {
  it.each([
    ['en', 'Photos never leave your device'],
    ['ka', 'ფოტოები შენს მოწყობილობას არ ტოვებს'],
    ['ru', 'Фото не покидают ваше устройство'],
  ])('says the photos never leave the device (%s), before a single photo is added', (locale, line) => {
    setup(locale);
    expect(screen.getByTestId('photo-privacy').textContent).toBe(line);
    expect(screen.getByTestId('photo-dropzone')).toBeTruthy();
  });

  it('takes JPEG, PNG and WebP from the picker into the grid, and says what it skipped', () => {
    const { add, container } = setup();
    add([file('IMG_2.jpg'), file('IMG_1.png', 'image/png'), file('a.heic', 'image/heic')]);
    // The studio already sits inside AppShell's <main>: the workspace must not open a second main landmark.
    expect(container.querySelector('main, [role="main"]')).toBeNull();
    expect(cellNames().map((l) => l.split(' · ')[0])).toEqual(['IMG_1.png', 'IMG_2.jpg']);
    expect(screen.getByRole('status').textContent).toContain('1 skipped — JPEG, PNG and WebP only');
    expect(screen.getByTestId('photo-input').getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
  });

  it('P picks and moves on, X rejects and moves on, U clears — ⌘P and keys inside a slider are left alone', () => {
    const { add, session } = setup();
    add([file('1.jpg'), file('2.jpg'), file('3.jpg')]);
    const status = () => session.get().items.map((i) => i.status);
    fireEvent.keyDown(document.body, { key: 'p' });
    expect(status()).toEqual(['pick', 'unrated', 'unrated']);
    expect(session.get().selectedId).toBe(session.get().items[1]!.id);
    fireEvent.keyDown(document.body, { key: 'x' });
    expect(status()).toEqual(['pick', 'reject', 'unrated']);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'u' });
    expect(status()).toEqual(['pick', 'unrated', 'unrated']);
    // ⌘P / Ctrl+P print; a culling app that ate them would be a bug.
    fireEvent.keyDown(document.body, { key: 'p', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'p', ctrlKey: true });
    expect(status()).toEqual(['pick', 'unrated', 'unrated']);
    // A key pressed inside a grade slider belongs to the slider.
    const slider = screen.getAllByRole('slider')[0]!;
    fireEvent.keyDown(slider, { key: 'x' });
    expect(status()).toEqual(['pick', 'unrated', 'unrated']);
  });

  it('the rating buttons do the same as the keys (a phone has no keyboard)', () => {
    const { add, session } = setup();
    add([file('1.jpg'), file('2.jpg')]);
    fireEvent.click(screen.getByTestId('rate-reject'));
    expect(session.get().items[0]!.status).toBe('reject');
    expect(screen.getByTestId('rate-pick').getAttribute('aria-label')).toBe('Pick (P)');
  });

  it('the Picks filter shows the picks only', () => {
    const { add } = setup();
    add([file('1.jpg'), file('2.jpg'), file('3.jpg')]);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'p' });
    fireEvent.click(screen.getByRole('button', { name: /^Picks/ }));
    expect(cellNames().map((l) => l.split(' · ')[0])).toEqual(['2.jpg']);
  });

  it('export takes the picks only — and with none, says how to make one instead of exporting nothing', async () => {
    const { add, session } = setup();
    add([file('1.jpg'), file('2.jpg')]);
    await act(async () => { fireEvent.click(screen.getByTestId('export-picks')); });
    expect(exportSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Mark some picks first (P)');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'p' });
    expect(session.get().dirty).toBe(true);
    await act(async () => { fireEvent.click(screen.getByTestId('export-picks')); });
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect((exportSpy.mock.calls[0]![0] as { name: string }[]).map((p) => p.name)).toEqual(['2.jpg']);
    expect(session.get().dirty).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('Saved 1 photo');
  });

  it('back returns to the chat; the session survives the workspace closing (another tool was picked)', () => {
    const { add, onExit, session, unmount } = setup();
    add([file('1.jpg')]);
    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));
    expect(onExit).toHaveBeenCalled();
    unmount();
    render(<PhotoWorkspace locale="en" onExit={() => {}} session={session} />);
    expect(cellNames()).toHaveLength(1);
  });
});
