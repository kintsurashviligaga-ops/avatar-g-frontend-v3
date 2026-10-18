/**
 * @jest-environment jsdom
 *
 * Every control in the motion panel has a name a screen reader can say, in the page's language (GG's UI plan, 2026-10-18):
 * the photo's ✕ was a span role=button INSIDE the upload button, nameless and deaf to the keyboard.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MotionControlPanel } from './MotionControlPanel';

jest.mock('./ui/LoadingLoop', () => ({ LoadingLoop: () => null }));

const unnamed = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"], [role="switch"], textarea, input:not([type="file"])'))
  .filter((el) => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.textContent ?? '').trim()));

async function addPhoto(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'me.png', { type: 'image/png' });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 20));
  });
}

test('before and after a photo: no control without a name; the ✕ is its own button, beside the upload', async () => {
  const { container } = render(<MotionControlPanel locale="ka" />);
  expect(unnamed(container)).toEqual([]);
  expect(screen.getByRole('button', { name: 'ატვირთე: პერსონაჟი' })).toBeTruthy();
  await addPhoto(container);
  expect(unnamed(container)).toEqual([]);
  const replace = screen.getByRole('button', { name: 'პერსონაჟის ფოტოს შეცვლა' });
  const remove = screen.getByRole('button', { name: 'ფოტოს წაშლა' });
  expect(replace.contains(remove)).toBe(false);
  expect(container.querySelector('span[role="button"]')).toBeNull();
  fireEvent.click(remove);
  expect(screen.queryByRole('button', { name: 'ფოტოს წაშლა' })).toBeNull();
});

test('the switches and fields are named in the page language, and a picked option says it is picked', () => {
  render(<MotionControlPanel locale="en" />);
  expect(screen.getByRole('switch', { name: 'Background music' })).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Lip-sync' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Describe the motion' })).toBeTruthy();
  const reels = screen.getByRole('button', { name: /9:16/ });
  expect(reels.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: /16:9/ }));
  expect(reels.getAttribute('aria-pressed')).toBe('false');
});
