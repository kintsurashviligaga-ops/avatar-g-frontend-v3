/**
 * @jest-environment jsdom
 *
 * DownloadButton — the one way a finished file is saved. Pinned: it saves through lib/media/saveMedia (never a
 * cross-origin <a download>, which the browser ignores), it is busy while the file is fetched so a double tap saves
 * once, and it speaks the page's language.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

const mockSaveMedia = jest.fn();
jest.mock('../../../lib/media/saveMedia', () => ({ saveMedia: (...a: unknown[]) => mockSaveMedia(...a) }));

import { DownloadButton } from './DownloadButton';

beforeEach(() => mockSaveMedia.mockReset());

test('saves through saveMedia with the name and the fallback extension, then reports the outcome', async () => {
  mockSaveMedia.mockResolvedValue('downloaded');
  const onOutcome = jest.fn();
  render(<DownloadButton url="https://cdn.test/v.mp4?sig=x" locale="ka" name="myavatar-video-1" fallbackExt="mp4" onOutcome={onOutcome} />);
  const btn = screen.getByRole('button', { name: 'ჩამოტვირთვა' });
  expect(btn.tagName).toBe('BUTTON');
  await act(async () => { fireEvent.click(btn); });
  expect(mockSaveMedia).toHaveBeenCalledWith('https://cdn.test/v.mp4?sig=x', 'myavatar-video-1', { fallbackExt: 'mp4' });
  expect(onOutcome).toHaveBeenCalledWith('downloaded');
});

test('busy while the file is fetched: a second tap does not save it twice', async () => {
  let finish: (v: string) => void = () => {};
  mockSaveMedia.mockImplementation(() => new Promise((r) => { finish = r; }));
  render(<DownloadButton url="https://cdn.test/a.png" locale="en" />);
  const btn = screen.getByRole('button', { name: 'Download' });
  await act(async () => { fireEvent.click(btn); });
  expect(btn.getAttribute('aria-busy')).toBe('true');
  expect((btn as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { fireEvent.click(btn); });
  expect(mockSaveMedia).toHaveBeenCalledTimes(1);
  await act(async () => { finish('downloaded'); });
  expect(btn.getAttribute('aria-busy')).toBe('false');
  expect((btn as HTMLButtonElement).disabled).toBe(false);
});

test('a pill shows the word; the icon looks carry it as their name; Russian and a custom label', () => {
  const { rerender } = render(<DownloadButton url="https://cdn.test/a.mp3" locale="ru" variant="pill" />);
  expect(screen.getByRole('button').textContent).toBe('Скачать');
  rerender(<DownloadButton url="https://cdn.test/a.mp3" locale="ka" variant="overlay" label="ვიდეოს ჩამოტვირთვა" />);
  const btn = screen.getByRole('button', { name: 'ვიდეოს ჩამოტვირთვა' });
  expect(btn.className).toContain('h-11');
  expect(btn.className).toContain('w-11');
});

test('no URL, no tap', () => {
  render(<DownloadButton url="" locale="ka" />);
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
});
