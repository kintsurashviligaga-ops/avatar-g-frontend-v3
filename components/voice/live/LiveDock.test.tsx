/**
 * The docked call: a non-modal floating capsule that reserves its MEASURED height (<html data-live-docked> +
 * `--live-dock-h`) so the app under it stays visible and usable; it names the call („ცოცხალი ზარი · Agent G"), shows the
 * agent's step (a spinner, then a check) or the last caption, stop-speaking only while the agent speaks, End as a calm
 * pill with a phone-down icon and its word (never the old red ✕), a link the agent put on screen (opened only by the
 * tap), and the countdown's Cancel with a draining bar.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

import type { LiveStep } from './LiveActivityFeed';
import LiveDock, { LIVE_DOCK_STRINGS, LiveRunBanner } from './LiveDock';

const base = {
  locale: 'en' as const,
  statusLabel: 'Listening',
  captions: [],
  muted: false,
  onToggleMute: jest.fn(),
  onEnd: jest.fn(),
  onExpand: jest.fn(),
};

const reading: LiveStep = { id: 'g1', kind: 'tool', name: 'get_screen_state', state: 'running', text: 'Reading the screen…' };

describe('LiveDock', () => {
  it('reserves its measured height while mounted (and gives it back), and is not a modal dialog', () => {
    // jsdom lays nothing out: stand in for the browser's measurement of the dock.
    const rect = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const h = this.getAttribute('data-testid') === 'live-dock' ? 131.4 : 0;
      return { x: 0, y: 0, top: 0, left: 0, bottom: h, right: 390, width: 390, height: h, toJSON: () => ({}) } as DOMRect;
    });
    try {
      const { unmount } = render(<LiveDock {...base} status="listening" />);
      const html = document.documentElement;
      expect(html.dataset.liveDocked).toBe('1');
      expect(html.style.getPropertyValue('--live-dock-h')).toBe('132px');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByRole('region', { name: 'Live conversation' })).toBeInTheDocument();
      unmount();
      expect(html.dataset.liveDocked).toBeUndefined();
      expect(html.style.getPropertyValue('--live-dock-h')).toBe('');
    } finally {
      rect.mockRestore();
    }
  });

  it.each(['ka', 'en', 'ru'] as const)('%s: says it is a live call with the agent, and its status', (locale) => {
    const t = LIVE_DOCK_STRINGS[locale];
    render(<LiveDock {...base} locale={locale} status="speaking" statusLabel="STATUS" />);
    const dock = screen.getByTestId('live-dock');
    expect(dock).toHaveTextContent(t.callLabel);
    expect(dock).toHaveTextContent('Agent G');
    expect(dock).toHaveTextContent('STATUS');
    // The agent is the rocket, in the orb.
    expect(dock.querySelector('[data-testid="live-orb-rocket"]')?.getAttribute('src')).toBe('/brand/rocket-mark-512.png');
    // Every control is a ≥ 44 px target with a name in the language.
    for (const name of [t.mute, t.expand, t.end]) {
      expect(screen.getByRole('button', { name }).className).toMatch(/\bh-\[44px\]/);
    }
  });

  it.each(['ka', 'en', 'ru'] as const)('%s: End is a calm pill with a phone-down icon and its word — not a red filled ✕', (locale) => {
    const t = LIVE_DOCK_STRINGS[locale];
    const onEnd = jest.fn();
    render(<LiveDock {...base} locale={locale} status="listening" onEnd={onEnd} />);
    const end = screen.getByTestId('live-dock-end');
    expect(end).toHaveAccessibleName(t.end);
    expect(end).toHaveTextContent(t.endShort);
    expect(t.end).toContain(t.endShort); // the visible word is in the name (WCAG 2.5.3)
    expect(end.className).toMatch(/bg-app-danger\/\[0\.16\]/); // a dark-red tint…
    expect(end.className).not.toMatch(/\bbg-app-danger\b(?!\/)/); // …never the solid red disc
    expect(end.className).toMatch(/\brounded-full\b/);
    expect(end.className).toMatch(/\bh-\[44px\]/);
    expect(end.querySelector('[data-icon="phone-off"]')).not.toBeNull();
    expect(end.querySelectorAll('svg')).toHaveLength(1); // the phone-down icon and nothing else: no ✕
    // The word shows from 360 px (an icon-only pill below that keeps the line readable on a 320 px phone).
    expect(end.querySelector('span')!.className).toMatch(/\bhidden\b.*min-\[360px\]:inline/);
    fireEvent.click(end);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('the line: the running step (spinner), the agent\'s words while it speaks; stop-speaking only while it speaks', () => {
    const onStopSpeaking = jest.fn();
    const onExpand = jest.fn();
    const { rerender } = render(<LiveDock {...base} status="thinking" step={reading} onStopSpeaking={onStopSpeaking} onExpand={onExpand} />);
    const line = screen.getByTestId('live-dock-line');
    expect(line).toHaveTextContent('Reading the screen…');
    expect(line).toHaveAttribute('data-kind', 'step');
    expect(line.querySelector('[data-mark="running"]')).not.toBeNull();
    expect(screen.queryByTestId('live-stop-speaking')).toBeNull();
    rerender(<LiveDock {...base} status="speaking" captions={[{ id: 'a', role: 'assistant', text: 'It is ready on screen.', final: false }]} step={{ ...reading, state: 'done', text: 'Read the screen' }} onStopSpeaking={onStopSpeaking} onExpand={onExpand} />);
    expect(screen.getByTestId('live-dock-line')).toHaveTextContent('It is ready on screen.');
    fireEvent.click(screen.getByTestId('live-stop-speaking'));
    expect(onStopSpeaking).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('live-dock-expand'));
    expect(onExpand).toHaveBeenCalled();
  });

  it('a step that just finished keeps the line with its check for a moment, then the last caption comes back', () => {
    jest.useFakeTimers();
    try {
      const caps = [{ id: 'u', role: 'user' as const, text: 'make a cat video', final: true }];
      const { rerender } = render(<LiveDock {...base} status="thinking" captions={caps} step={{ id: 'p', kind: 'tool', name: 'prepare_generation', state: 'running', text: 'Preparing the studio…' }} />);
      rerender(<LiveDock {...base} status="listening" captions={caps} step={{ id: 'p', kind: 'tool', name: 'prepare_generation', state: 'done', text: 'Studio prepared' }} />);
      const line = screen.getByTestId('live-dock-line');
      expect(line).toHaveTextContent('Studio prepared');
      expect(line.querySelector('[data-mark="done"]')).not.toBeNull();
      act(() => { jest.advanceTimersByTime(5100); });
      expect(screen.getByTestId('live-dock-line')).toHaveTextContent('make a cat video');
      expect(screen.getByTestId('live-dock-line')).toHaveAttribute('data-kind', 'caption');
    } finally {
      jest.useRealTimers();
    }
  });

  it('before anything was said, the line invites the user to talk', () => {
    render(<LiveDock {...base} status="listening" />);
    expect(screen.getByTestId('live-dock-line')).toHaveTextContent(LIVE_DOCK_STRINGS.en.hint);
  });

  it('a link the agent put on screen: a chip with the site; nothing opens until the tap, and the tap opens a new tab', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    try {
      const onDismissLink = jest.fn();
      const link = { id: 'l1', url: 'https://www.youtube.com/results?search_query=cats', title: 'YouTube: cats' };
      render(<LiveDock {...base} status="listening" link={link} onDismissLink={onDismissLink} />);
      const chip = screen.getByTestId('live-dock-link');
      expect(chip).toHaveTextContent('YouTube: cats');
      expect(chip).toHaveTextContent('youtube.com');
      expect(open).not.toHaveBeenCalled();
      const btn = screen.getByTestId('live-dock-link-open');
      expect(btn).toHaveAccessibleName(LIVE_DOCK_STRINGS.en.openLinkLabel('youtube.com'));
      expect(btn.className).toMatch(/\bh-\[44px\]/);
      fireEvent.click(btn);
      expect(open).toHaveBeenCalledWith('https://www.youtube.com/results?search_query=cats', '_blank', 'noopener,noreferrer');
      expect(onDismissLink).toHaveBeenCalledWith('l1'); // opened → the chip gives its room back
      fireEvent.click(screen.getByRole('button', { name: LIVE_DOCK_STRINGS.en.dismissLink }));
      expect(onDismissLink).toHaveBeenCalledTimes(2);
      expect(open).toHaveBeenCalledTimes(1);
    } finally {
      open.mockRestore();
    }
  });

  it('the countdown banner sits inside the dock (its height is reserved too)', () => {
    const run = { id: 's', tool: 'image', priceCredits: 2, runsAt: Date.now() + 3000, state: 'counting' as const };
    render(<LiveDock {...base} status="listening" pendingRun={run} onCancelRun={jest.fn()} />);
    expect(screen.getByTestId('live-dock')).toContainElement(screen.getByTestId('live-run-banner'));
  });

  it('the countdown banner names the price and offers Cancel; it counts down and its bar drains', () => {
    jest.useFakeTimers();
    try {
      const onCancel = jest.fn();
      const run = { id: 's', tool: 'image', priceCredits: 2, runsAt: Date.now() + 3000, state: 'counting' as const };
      render(<LiveRunBanner run={run} locale="en" onCancel={onCancel} />);
      expect(screen.getByTestId('live-run-banner')).toHaveTextContent('Starts in 3 s');
      expect(screen.getByTestId('live-run-banner')).toHaveTextContent('2 credits');
      const full = parseFloat(screen.getByTestId('live-run-progress').style.width);
      expect(full).toBeGreaterThan(95);
      act(() => { jest.advanceTimersByTime(1200); });
      expect(screen.getByTestId('live-run-banner')).toHaveTextContent('Starts in 2 s');
      expect(parseFloat(screen.getByTestId('live-run-progress').style.width)).toBeLessThan(full);
      fireEvent.click(screen.getByTestId('live-run-cancel'));
      expect(onCancel).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a settled run says how it ended, with no Cancel and no bar', () => {
    render(<LiveRunBanner run={{ id: 's', tool: 'image', runsAt: 0, state: 'cancelled' }} locale="ka" onCancel={() => {}} />);
    expect(screen.getByTestId('live-run-banner')).toHaveTextContent('გაუქმდა');
    expect(screen.queryByTestId('live-run-cancel')).toBeNull();
    expect(screen.queryByTestId('live-run-progress')).toBeNull();
  });
});
