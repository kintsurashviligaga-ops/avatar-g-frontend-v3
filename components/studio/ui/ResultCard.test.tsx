/**
 * @jest-environment jsdom
 *
 * ResultCard — one tile from "asked for" to "on screen". What is pinned here is the contract a screenshot
 * cannot hold: the tile keeps the result's shape in every state, the percentage is honest (a real percent
 * wins, a guess stops at 92), cancel / retry / dismiss call back, and state changes — not percent ticks —
 * are announced.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ResultCard, resultPct, RESULT_HOLD_PCT } from './ResultCard';

describe('resultPct — honest progress', () => {
  it('uses a real server percent when there is one', () => {
    expect(resultPct({ state: 'rendering', pct: 12, elapsedSec: 500, capSec: 60 })).toBe(12);
    expect(resultPct({ state: 'rendering', pct: 100 })).toBe(99); // 100 only when the media is here
  });
  it('otherwise paces elapsed / cap and holds at 92 until the job is ready', () => {
    expect(resultPct({ state: 'rendering', elapsedSec: 30, capSec: 100 })).toBe(30);
    expect(resultPct({ state: 'rendering', elapsedSec: 999, capSec: 100 })).toBe(RESULT_HOLD_PCT);
    expect(resultPct({ state: 'finalizing', elapsedSec: 10, capSec: 100 })).toBe(RESULT_HOLD_PCT);
  });
  it('queued is 0 and ready is 100', () => {
    expect(resultPct({ state: 'queued', pct: 40 })).toBe(0);
    expect(resultPct({ state: 'ready' })).toBe(100);
  });
});

describe('ResultCard', () => {
  it('renders a rendering video as a 9:16 tile with «ვიდეო · 9:16 · 12%» and a 44 px cancel, and no drawn bar', () => {
    const onCancel = jest.fn();
    const { container } = render(<ResultCard kind="video" aspect="9:16" state="rendering" locale="ka" pct={12} onCancel={onCancel} />);
    expect(screen.getByText('ვიდეო · 9:16 · 12%')).toBeTruthy();
    const tile = container.querySelector('[data-testid="result-card"] > div') as HTMLElement;
    expect(tile.style.aspectRatio).toBe('9 / 16');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('12');
    // The caption is the progressbar: no width-animated bar under it (MASTER TASK v3.1 §3.3, Phase 2 PR 4).
    expect(container.querySelector('[class*="transition-[width]"], [style*="width"]')).toBeNull();
    expect(container.querySelector('[data-testid="loading-loop-poster"]')).not.toBeNull(); // the loading loop, not a spinner
    const cancel = screen.getByRole('button', { name: 'გაუქმება' });
    expect(cancel.className).toContain('h-11');
    expect(cancel.className).toContain('w-11');
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the same shape when the media arrives, and offers open / download / use as reference', () => {
    const onOpen = jest.fn();
    const onUseAsRef = jest.fn();
    const { container, rerender } = render(<ResultCard kind="image" aspect="4:5" state="rendering" locale="en" elapsedSec={5} capSec={50} />);
    const shapeBefore = (container.querySelector('[data-testid="result-card"] > div') as HTMLElement).style.aspectRatio;
    rerender(<ResultCard kind="image" aspect="4:5" state="ready" locale="en" media={{ type: 'image', url: 'https://x.test/a.png' }} onOpen={onOpen} onUseAsRef={onUseAsRef} />);
    const shapeAfter = (container.querySelector('[data-testid="result-card"] > div') as HTMLElement).style.aspectRatio;
    expect(shapeAfter).toBe(shapeBefore);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://x.test/a.png');
    expect(screen.queryByRole('progressbar')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use as reference' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onUseAsRef).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Download' }).getAttribute('href')).toBe('https://x.test/a.png');
  });

  it('shows a ready video as a real <video>', () => {
    const { container } = render(<ResultCard kind="video" aspect="9:16" state="ready" locale="en" media={{ type: 'video', url: 'https://x.test/v.mp4' }} />);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('https://x.test/v.mp4');
  });

  it('fails in one line with retry and dismiss', () => {
    const onRetry = jest.fn();
    const onDismiss = jest.fn();
    render(<ResultCard kind="video" aspect="9:16" state="error" locale="en" error={'⚠️ The render timed out\nstack…'} onRetry={onRetry} onDismiss={onDismiss} />);
    expect(screen.getByText('The render timed out')).toBeTruthy();
    expect(screen.queryByText(/stack/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('says «რიგში» when queued, with no number', () => {
    render(<ResultCard kind="video" aspect="16:9" state="queued" locale="ka" pct={50} />);
    expect(screen.getByText('ვიდეო · 16:9 · რიგში')).toBeTruthy();
    // A job that has not started has no percent to report: the progressbar is indeterminate, like the loading card's.
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  });

  it('never reads 100 while rendering, and its number never goes back', () => {
    const { rerender } = render(<ResultCard kind="video" aspect="9:16" state="rendering" locale="en" pct={100} />);
    expect(screen.getByTestId('result-card-caption').textContent).toBe('Video · 9:16 · 99%');
    rerender(<ResultCard kind="video" aspect="9:16" state="rendering" locale="en" pct={40} />);
    expect(screen.getByTestId('result-card-caption').textContent).toBe('Video · 9:16 · 99%');
  });

  it('holds a server percent that arrives below the time estimate already shown', () => {
    const { rerender } = render(<ResultCard kind="image" aspect="1:1" state="rendering" locale="en" elapsedSec={30} capSec={60} />);
    expect(screen.getByTestId('result-card-caption').textContent).toBe('Image · 1:1 · 50%');
    rerender(<ResultCard kind="image" aspect="1:1" state="rendering" locale="en" elapsedSec={31} capSec={60} pct={20} />);
    expect(screen.getByTestId('result-card-caption').textContent).toBe('Image · 1:1 · 50%');
  });

  it('announces state changes politely, not every percent', () => {
    const { container, rerender } = render(<ResultCard kind="image" aspect="1:1" state="rendering" locale="en" pct={10} />);
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live.textContent).toBe('Image: Rendering');
    act(() => { rerender(<ResultCard kind="image" aspect="1:1" state="rendering" locale="en" pct={40} />); });
    expect(live.textContent).toBe('Image: Rendering');
    act(() => { rerender(<ResultCard kind="image" aspect="1:1" state="ready" locale="en" media={{ type: 'image', url: 'https://x.test/a.png' }} />); });
    expect(live.textContent).toBe('Image: Ready');
  });

  it('music has no frame ratio in its caption and stays square', () => {
    const { container } = render(<ResultCard kind="music" aspect="9:16" state="rendering" locale="en" pct={30} />);
    expect(screen.getByText('Music · 30%')).toBeTruthy();
    expect((container.querySelector('[data-testid="result-card"] > div') as HTMLElement).style.aspectRatio).toBe('1 / 1');
  });
});

describe('ResultCard errorFull (the film\'s refusal reasons, Video Core round 3)', () => {
  const why = 'The finished video failed its quality check (frame_count_mismatch: counted 890 frames, expected 891). Nothing was delivered or charged.';
  it('prints the whole sentence, unclamped', () => {
    render(<ResultCard kind="video" aspect="9:16" state="error" locale="en" error={`⚠️ ${why}`} errorFull />);
    const p = screen.getByText(why);
    expect(p.className).not.toMatch(/line-clamp/);
  });
  it('without the flag the card keeps its two-line clamp', () => {
    render(<ResultCard kind="video" aspect="9:16" state="error" locale="en" error={why} />);
    expect(screen.getByText(why).className).toMatch(/line-clamp-2/);
  });
  it('an error shows its warning icon only: the film icon no longer sits on the text (the ad film\'s card, 2026-10-15)', () => {
    const { container, rerender } = render(<ResultCard kind="video" aspect="9:16" state="error" locale="en" error={why} errorFull />);
    // A className replaces lucide's own classes, so the icons are told apart by theirs: the centred kind icon is the
    // translucent one, the warning is text-app-warning.
    const svgs = () => [...container.querySelectorAll('svg')].map((el) => el.getAttribute('class') ?? '');
    expect(svgs()).toEqual(['text-app-warning']);
    // The plate still shows the kind icon when there is no media and no error.
    rerender(<ResultCard kind="video" aspect="9:16" state="ready" locale="en" />);
    expect(svgs().some((c) => c.includes('top-1/2') && c.includes('text-app-text/20'))).toBe(true);
  });
});
