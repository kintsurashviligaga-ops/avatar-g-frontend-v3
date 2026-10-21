/** @jest-environment-options {"url":"https://myavatar.ge/en/dashboard"} */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import LiveModeOverlay, { LIVE_OVERLAY_STRINGS } from './LiveModeOverlay';

const handlers = () => ({ onToggleMute: jest.fn(), onToggleCamera: jest.fn(), onEnd: jest.fn(), onRetry: jest.fn() });
const savedClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const savedExec = Object.getOwnPropertyDescriptor(document, 'execCommand');

beforeEach(() => {
  window.history.replaceState({}, '', '/en/dashboard?tool=music&code=private-code&token=private-token#private-fragment');
});
afterEach(() => {
  jest.restoreAllMocks();
  if (savedClipboard) Object.defineProperty(navigator, 'clipboard', savedClipboard);
  else delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  if (savedExec) Object.defineProperty(document, 'execCommand', savedExec);
  else delete (document as unknown as { execCommand?: unknown }).execCommand;
});

function clipboard(writeText: jest.Mock) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
}

test.each(['ka', 'en', 'ru'] as const)('%s: in-app mic recovery copies only a clean current-page Live URL on tap', async (locale) => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  clipboard(writeText);
  const h = handlers();
  const t = LIVE_OVERLAY_STRINGS[locale];
  render(<LiveModeOverlay locale={locale} status="error" error="mic_in_app" captions={[]} muted={false} cameraOn={false} {...h} />);
  const input = screen.getByRole('textbox');
  expect(input).toHaveAttribute('readonly');
  expect(input).toHaveValue('https://myavatar.ge/en/dashboard?voice=1');
  expect(writeText).not.toHaveBeenCalled();
  expect(h.onRetry).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: t.copyLink })); });
  expect(writeText).toHaveBeenCalledWith('https://myavatar.ge/en/dashboard?voice=1');
  expect(screen.getByRole('button', { name: t.copied })).toBeVisible();
});

test('Android offers a user-tapped Chrome handoff without query secrets; iOS keeps copy/manual fallback', () => {
  const ua = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14; wv) Instagram');
  const props = { locale: 'en' as const, status: 'error' as const, error: 'mic_in_app' as const, captions: [], muted: false, cameraOn: false, ...handlers() };
  const { rerender } = render(<LiveModeOverlay {...props} />);
  expect(screen.getByRole('link', { name: 'Open in browser' })).toHaveAttribute('href', 'intent://myavatar.ge/en/dashboard?voice=1#Intent;scheme=https;package=com.android.chrome;end');
  ua.mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Instagram');
  rerender(<LiveModeOverlay {...props} />);
  expect(screen.queryByRole('link', { name: 'Open in browser' })).toBeNull();
  expect(screen.getByRole('textbox')).toHaveValue('https://myavatar.ge/en/dashboard?voice=1');
});

test.each([false, 'throws'] as const)('clipboard and fallback failure (%s) is honest and leaves the manual URL available', async (fallback) => {
  clipboard(jest.fn().mockRejectedValue(new Error('Denied')));
  Object.defineProperty(document, 'execCommand', { configurable: true, value: jest.fn(() => { if (fallback === 'throws') throw new Error('Denied'); return false; }) });
  render(<LiveModeOverlay locale="en" status="error" error="mic_in_app" captions={[]} muted={false} cameraOn={false} {...handlers()} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy link' })); });
  expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Could not copy');
  expect(screen.getByRole('textbox')).toHaveValue('https://myavatar.ge/en/dashboard?voice=1');
  expect(document.querySelector('textarea')).toBeNull();
});

test('clipboard refusal can use the supported legacy copy fallback and restores focus', async () => {
  clipboard(jest.fn().mockRejectedValue(new Error('Denied')));
  const fallback = jest.fn(() => true);
  Object.defineProperty(document, 'execCommand', { configurable: true, value: fallback });
  render(<LiveModeOverlay locale="en" status="error" error="mic_in_app" captions={[]} muted={false} cameraOn={false} {...handlers()} />);
  const copy = screen.getByRole('button', { name: 'Copy link' });
  copy.focus();
  await act(async () => { fireEvent.click(copy); });
  expect(fallback).toHaveBeenCalledWith('copy');
  expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(document.activeElement).toBe(copy);
  expect(document.querySelector('textarea')).toBeNull();
});

test('other errors do not offer a browser handoff', () => {
  render(<LiveModeOverlay locale="en" status="error" error="connection_lost" captions={[]} muted={false} cameraOn={false} {...handlers()} />);
  expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
});
