import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import LiveModeOverlay, { LIVE_OVERLAY_STRINGS } from './LiveModeOverlay';
import { LIVE_DOCK_STRINGS } from './LiveDock';

const handlers = () => ({ onToggleMute: jest.fn(), onToggleCamera: jest.fn(), onEnd: jest.fn() });

test.each(['ka', 'en', 'ru'] as const)('%s controls are unique, localized and expose their state', (locale) => {
  const t = LIVE_OVERLAY_STRINGS[locale];
  const h = handlers();
  const flip = jest.fn();
  render(<LiveModeOverlay locale={locale} status="listening" captions={[]} muted cameraOn cameraFacing="user" {...h} onFlipCamera={flip} />);
  const camera = screen.getByRole('button', { name: t.camera, exact: true });
  const mute = screen.getByRole('button', { name: t.mute, exact: true });
  expect(camera).toHaveAttribute('aria-pressed', 'true');
  expect(mute).toHaveAttribute('aria-pressed', 'true');
  const switchCamera = screen.getByRole('button', { name: t.flip, exact: true });
  expect(switchCamera).toHaveAttribute('title', t.backCamera);
  fireEvent.click(camera);
  fireEvent.click(mute);
  fireEvent.click(switchCamera);
  expect(h.onToggleCamera).toHaveBeenCalledTimes(1);
  expect(h.onToggleMute).toHaveBeenCalledTimes(1);
  expect(flip).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Add', exact: true })).toBeNull();
});

test('show screen docks the call without ending it and is absent without a dock callback', () => {
  const h = handlers();
  const dock = jest.fn();
  const props = { locale: 'en' as const, status: 'listening' as const, captions: [], muted: false, cameraOn: false, ...h };
  const { rerender } = render(<LiveModeOverlay {...props} onToggleDock={dock} />);
  fireEvent.click(screen.getByRole('button', { name: LIVE_OVERLAY_STRINGS.en.showScreen }));
  expect(dock).toHaveBeenCalledTimes(1);
  expect(h.onEnd).not.toHaveBeenCalled();
  rerender(<LiveModeOverlay {...props} />);
  expect(screen.queryByRole('button', { name: LIVE_OVERLAY_STRINGS.en.showScreen })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: LIVE_OVERLAY_STRINGS.en.end }));
  expect(h.onEnd).toHaveBeenCalledTimes(1);
});

test('muting rests the input waveform, but model output and the native interrupt button remain available', () => {
  const stop = jest.fn();
  const props = { locale: 'en' as const, captions: [], muted: true, cameraOn: false, ...handlers(), onStopSpeaking: stop };
  const { rerender } = render(<LiveModeOverlay {...props} status="listening" />);
  const state = () => screen.getByTestId('live-waveform').querySelector('[data-state]');
  expect(state()).toHaveAttribute('data-state', 'idle');
  expect(screen.queryByRole('button', { name: LIVE_DOCK_STRINGS.en.stopSpeaking })).toBeNull();
  rerender(<LiveModeOverlay {...props} status="speaking" />);
  expect(state()).toHaveAttribute('data-state', 'speaking');
  const interrupt = screen.getByRole('button', { name: LIVE_DOCK_STRINGS.en.stopSpeaking });
  expect(interrupt.tagName).toBe('BUTTON');
  fireEvent.click(interrupt);
  expect(stop).toHaveBeenCalledTimes(1);
});

test('copying a caption reports success only after the clipboard write succeeds', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = jest.fn().mockRejectedValueOnce(new Error('Denied')).mockResolvedValueOnce(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    render(<LiveModeOverlay locale="en" status="listening" muted={false} cameraOn={false} {...handlers()}
      captions={[{ id: 'a', role: 'assistant', text: 'A real answer', final: true }]} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy text' })); });
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Could not copy');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy text' })); });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(writeText).toHaveBeenCalledWith('A real answer');
    expect(screen.queryByRole('status')).toBeNull();
  } finally {
    if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
    else delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  }
});
