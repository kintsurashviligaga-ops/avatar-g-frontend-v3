import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import LiveModeOverlay from './LiveModeOverlay';
import type { LiveErrorCode } from './useGeminiLiveSession';

const callbacks = () => ({ onToggleMute: jest.fn(), onToggleCamera: jest.fn(), onEnd: jest.fn(), onRetry: jest.fn() });
const codes: LiveErrorCode[] = ['mic_denied', 'mic_system_denied', 'mic_not_found', 'mic_busy', 'mic_in_app', 'mic_insecure', 'mic_lost', 'mic_unavailable'];

describe('Live recovery in the current screen', () => {
  test.each(codes)('%s explains a microphone failure, hides stale speech and keeps recovery usable', (error) => {
    const h = callbacks();
    render(<LiveModeOverlay locale="en" status="error" error={error} errorDetail={{ name: 'NotReadableError', message: 'private diagnostic' }}
      captions={[{ id: 'old', role: 'assistant', text: 'old speech', final: true }]} muted={false} cameraOn {...h} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Microphone unavailable');
    expect(screen.getByRole('alert')).not.toHaveTextContent(error);
    expect(screen.getByRole('alert').textContent!.length).toBeGreaterThan(15);
    expect(screen.getByTestId('live-error-name')).toHaveTextContent('NotReadableError');
    expect(screen.queryByText('private diagnostic')).toBeNull();
    expect(screen.queryByText('old speech')).toBeNull();
    expect(screen.queryByRole('button', { name: /camera|mute/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['ka', 'უკავშირდება…'], ['en', 'Connecting…'], ['ru', 'Подключение…'],
  ] as const)('%s status uses the page language without invented speech', (locale, label) => {
    render(<LiveModeOverlay locale={locale} status="connecting" captions={[]} muted={false} cameraOn={false} {...callbacks()} />);
    expect(screen.getByTestId('live-status')).toHaveTextContent(label);
    expect(screen.queryByText('გამარჯობა! რით შემიძლია დაგეხმაროთ?')).toBeNull();
  });

  test('sound resumes only from the user gesture and Escape ends the full-screen call once', () => {
    const h = callbacks();
    const resume = jest.fn();
    render(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn={false} {...h} audioBlocked onResumeAudio={resume} />);
    expect(screen.getByRole('dialog', { name: 'Live Conversation' })).toHaveAttribute('aria-modal', 'true');
    expect(resume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tap to turn on sound' }));
    expect(resume).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  test('docked status stays localized and Escape leaves the ongoing docked call alone', () => {
    const h = callbacks();
    render(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn={false} {...h} docked />);
    expect(screen.getByText('Listening')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(h.onEnd).not.toHaveBeenCalled();
  });
});
