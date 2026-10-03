/**
 * The docked call: a slim, non-modal bar that reserves its height (<html data-live-docked>) so the app under it stays
 * visible and usable; it shows the running line, stop-speaking only while the agent speaks, and the countdown's Cancel.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

import LiveDock, { LiveRunBanner } from './LiveDock';

const base = {
  locale: 'en' as const,
  statusLabel: 'Listening',
  captions: [],
  muted: false,
  onToggleMute: jest.fn(),
  onEnd: jest.fn(),
  onExpand: jest.fn(),
};

describe('LiveDock', () => {
  it('reserves its height while mounted and is not a modal dialog', () => {
    const { unmount } = render(<LiveDock {...base} status="listening" />);
    expect(document.documentElement.dataset.liveDocked).toBe('1');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region', { name: 'Live conversation' })).toBeInTheDocument();
    unmount();
    expect(document.documentElement.dataset.liveDocked).toBeUndefined();
  });

  it('shows the last caption, else the running step; stop-speaking only while the agent speaks', () => {
    const onStopSpeaking = jest.fn();
    const { rerender } = render(<LiveDock {...base} status="thinking" activityLine="Reading the screen" onStopSpeaking={onStopSpeaking} />);
    expect(screen.getByTestId('live-dock-line')).toHaveTextContent('Reading the screen');
    expect(screen.queryByTestId('live-stop-speaking')).toBeNull();
    rerender(<LiveDock {...base} status="speaking" captions={[{ id: 'a', role: 'assistant', text: 'It is ready on screen.', final: false }]} onStopSpeaking={onStopSpeaking} />);
    expect(screen.getByTestId('live-dock-line')).toHaveTextContent('It is ready on screen.');
    fireEvent.click(screen.getByTestId('live-stop-speaking'));
    expect(onStopSpeaking).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('live-dock-expand'));
    expect(base.onExpand).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('live-dock-end'));
    expect(base.onEnd).toHaveBeenCalled();
  });

  it('the countdown banner names the price and offers Cancel; it counts down', () => {
    jest.useFakeTimers();
    try {
      const onCancel = jest.fn();
      const run = { id: 's', tool: 'image', priceCredits: 2, runsAt: Date.now() + 3000, state: 'counting' as const };
      render(<LiveRunBanner run={run} locale="en" onCancel={onCancel} />);
      expect(screen.getByTestId('live-run-banner')).toHaveTextContent('Starts in 3 s');
      expect(screen.getByTestId('live-run-banner')).toHaveTextContent('2 credits');
      act(() => { jest.advanceTimersByTime(1200); });
      expect(screen.getByTestId('live-run-banner')).toHaveTextContent('Starts in 2 s');
      fireEvent.click(screen.getByTestId('live-run-cancel'));
      expect(onCancel).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a settled run says how it ended, with no Cancel', () => {
    render(<LiveRunBanner run={{ id: 's', tool: 'image', runsAt: 0, state: 'cancelled' }} locale="ka" onCancel={() => {}} />);
    expect(screen.getByTestId('live-run-banner')).toHaveTextContent('გაუქმდა');
    expect(screen.queryByTestId('live-run-cancel')).toBeNull();
  });
});
