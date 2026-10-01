/**
 * The Live screen's action strip: localized (ka/en/ru) cards for what the agent did, newest first and capped at 3,
 * ≥ 44 px Open buttons whose accessible name contains the visible word, ONE polite announcement per new card (never
 * a re-read when an older card resurfaces), a Copy for code, removal on cancellation, and the overlay making room for
 * the strip (and dropping it on the error screen).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';

import LiveActionCards, { LIVE_ACTION_STRINGS, liveActionAnnouncement, liveActionDetail, liveActionTitle } from './LiveActionCards';
import LiveModeOverlay from './LiveModeOverlay';
import type { LiveActionCard } from './liveActions';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

const video: LiveActionCard = {
  id: 'c1',
  action: { type: 'prepare_generation', tool: 'video', prompt: 'A cat surfing at sunset', aspectRatio: '9:16', durationSec: 24, style: 'cinematic' },
};
const studio: LiveActionCard = { id: 'c2', action: { type: 'open_studio', tool: 'music' } };
const code: LiveActionCard = { id: 'c3', action: { type: 'show_code', title: 'Fibonacci', language: 'python', code: 'def fib(n):\n  return n' } };
const image: LiveActionCard = { id: 'c4', action: { type: 'prepare_generation', tool: 'image', prompt: 'A red fox' } };

const handlers = () => ({ onToggleMute: jest.fn(), onToggleCamera: jest.fn(), onEnd: jest.fn() });

describe('copy helpers', () => {
  it.each(['ka', 'en', 'ru'] as const)('%s: every title, label and hint exists; Open labels contain the visible word', (locale) => {
    const s = LIVE_ACTION_STRINGS[locale];
    for (const tool of ['video', 'image', 'music', 'avatar'] as const) {
      expect(s.prepared[tool]).toBeTruthy();
      expect(s.opened[tool]).toBeTruthy();
    }
    expect(s.openStudioLabel).toContain(s.open);
    expect(s.openCodeLabel).toContain(s.open);
  });

  it('title / detail / announcement per action', () => {
    expect(liveActionTitle(video.action, 'en')).toBe('Prepared a video prompt');
    expect(liveActionTitle(image.action, 'ka')).toBe('სურათის პრომპტი მოვამზადე');
    expect(liveActionTitle(studio.action, 'ru')).toBe('Открыта студия музыки');
    expect(liveActionTitle(code.action, 'en')).toBe('Fibonacci');
    expect(liveActionDetail(video.action, 'ka')).toBe('9:16 · 24 წმ · cinematic · A cat surfing at sunset');
    expect(liveActionDetail(code.action, 'en')).toBe('Code · python');
    expect(liveActionDetail(studio.action, 'en')).toBe('');
    expect(liveActionAnnouncement(video.action, 'en')).toBe('Prepared a video prompt. Not started — you run it from the studio.');
    expect(liveActionAnnouncement(code.action, 'en')).toBe('Code on screen: Fibonacci');
  });
});

describe('LiveActionCards', () => {
  it.each(['ka', 'en', 'ru'] as const)('%s: a card per action with its title, detail and a ≥ 44 px Open', (locale) => {
    const s = LIVE_ACTION_STRINGS[locale];
    const onOpen = jest.fn();
    render(<LiveActionCards cards={[video, studio]} locale={locale} onOpen={onOpen} />);
    expect(screen.getByRole('region', { name: s.region })).toBeTruthy();
    const cards = screen.getAllByTestId('live-action-card');
    expect(cards.map((c) => c.getAttribute('data-action'))).toEqual(['prepare_generation', 'open_studio']);
    expect(within(cards[0]!).getByText(s.prepared.video)).toBeTruthy();
    expect(within(cards[0]!).getByText(liveActionDetail(video.action, locale))).toBeTruthy();
    const open = within(cards[0]!).getByRole('button', { name: s.openStudioLabel });
    expect(open.textContent).toBe(s.open);
    expect(open.className).toMatch(/\bh-11\b/);
    expect(open.className).toMatch(/\bmin-w-\[44px\]/);
    // Georgian never under 16 px.
    if (locale === 'ka') expect(within(cards[0]!).getByText(s.prepared.video).className).toMatch(/text-\[16px\]/);
    fireEvent.click(within(cards[1]!).getByRole('button', { name: s.openStudioLabel }));
    expect(onOpen).toHaveBeenCalledWith(studio);
  });

  it('shows at most the 3 newest cards', () => {
    const more: LiveActionCard[] = [image, code, studio, video, { id: 'c5', action: { type: 'open_studio', tool: 'avatar' } }];
    render(<LiveActionCards cards={more} locale="en" onOpen={jest.fn()} />);
    expect(screen.getAllByTestId('live-action-card')).toHaveLength(3);
    expect(screen.getByText('Prepared an image prompt')).toBeTruthy();
    expect(screen.queryByText('Prepared a video prompt')).toBeNull();
  });

  it('one polite announcement per NEW card; a cancelled newest card does not re-announce the older one', async () => {
    const { rerender } = render(<LiveActionCards cards={[]} locale="en" onOpen={jest.fn()} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe(''); // mounted, empty, before any card (a live region must pre-exist)

    rerender(<LiveActionCards cards={[video]} locale="en" onOpen={jest.fn()} />);
    expect(status.textContent).toBe('Prepared a video prompt. Not started — you run it from the studio.');
    rerender(<LiveActionCards cards={[code, video]} locale="en" onOpen={jest.fn()} />);
    expect(status.textContent).toBe('Code on screen: Fibonacci');
    rerender(<LiveActionCards cards={[video]} locale="en" onOpen={jest.fn()} />); // the code call was cancelled
    expect(status.textContent).toBe('Code on screen: Fibonacci'); // unchanged → nothing re-read
    // The cards themselves are not inside the live region.
    expect(within(status).queryByRole('button')).toBeNull();
    await waitFor(() => expect(screen.getAllByTestId('live-action-card')).toHaveLength(1)); // let the exit settle
  });

  it('a cancelled card leaves the strip', async () => {
    const { rerender } = render(<LiveActionCards cards={[image, video]} locale="en" onOpen={jest.fn()} />);
    rerender(<LiveActionCards cards={[video]} locale="en" onOpen={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('live-action-card')).toHaveLength(1));
    expect(screen.queryByText('Prepared an image prompt')).toBeNull();
  });

  it('code cards copy the code (and say so)', async () => {
    const writeText = jest.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const onOpen = jest.fn();
    render(<LiveActionCards cards={[code]} locale="en" onOpen={onOpen} />);
    const s = LIVE_ACTION_STRINGS.en;
    expect(screen.getByRole('button', { name: s.openCodeLabel }).textContent).toBe(s.open);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: s.copy })); });
    expect(writeText).toHaveBeenCalledWith('def fib(n):\n  return n');
    expect(screen.getByRole('button', { name: s.copied })).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled(); // copying never ends the call
  });
});

describe('LiveModeOverlay — the action strip', () => {
  it('renders above the pill with onOpenAction; the content moves up only while it holds cards', () => {
    const onOpenAction = jest.fn();
    const { rerender } = render(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn={false} {...handlers()} actions={[]} onOpenAction={onOpenAction} />);
    const dialog = screen.getByRole('dialog');
    expect(screen.getByRole('status')).toBeTruthy(); // the strip's live region is mounted for the whole call
    expect(screen.queryAllByTestId('live-action-card')).toHaveLength(0);
    expect(dialog.style.paddingBottom).toContain('112px');

    rerender(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn={false} {...handlers()} actions={[video]} onOpenAction={onOpenAction} />);
    expect(screen.getAllByTestId('live-action-card')).toHaveLength(1);
    expect(dialog.style.paddingBottom).toContain('196px');
    fireEvent.click(screen.getByRole('button', { name: LIVE_ACTION_STRINGS.en.openStudioLabel }));
    expect(onOpenAction).toHaveBeenCalledWith(video);
  });

  it('no strip without a host handler, and none on the error screen', () => {
    const { rerender } = render(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn={false} {...handlers()} actions={[video]} />);
    expect(screen.queryByTestId('live-action-card')).toBeNull();
    rerender(<LiveModeOverlay locale="en" status="error" error="connection_lost" captions={[]} muted={false} cameraOn={false} {...handlers()} actions={[video]} onOpenAction={jest.fn()} />);
    expect(screen.queryByTestId('live-action-card')).toBeNull();
    expect(screen.getByRole('dialog').style.paddingBottom).toContain('112px');
  });
});
