/**
 * @jest-environment jsdom
 *
 * LoadingCard — the one loading card (the owner's PRD 2026-10-18: no progress bar, only a refined percentage). What is
 * pinned here: the number is honest (a measured percent wins, a guess never reaches 100 and stops below 95), nothing on
 * the card is a bar, the blue-wave loop is the picture, cancel calls back, and state changes, not ticks, are announced.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { LOADING_HOLD_PCT, LoadingCard, easedPct, loadingPct } from './LoadingCard';
import { easedPct as reExported } from './GenerationProgress';

describe('loadingPct — honest numbers', () => {
  it('prints a measured percent, at most 99 until the result is here', () => {
    expect(loadingPct({ pct: 42, elapsedSec: 999 })).toBe(42);
    expect(loadingPct({ pct: 100 })).toBe(99);
    expect(loadingPct({ pct: 12.6 })).toBe(13);
  });
  it('otherwise eases the elapsed time toward the ceiling and never reaches it', () => {
    expect(loadingPct({ elapsedSec: 0, targetSec: 60 })).toBe(0);
    const early = loadingPct({ elapsedSec: 10, targetSec: 60 }) as number;
    const later = loadingPct({ elapsedSec: 40, targetSec: 60 }) as number;
    expect(early).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(early);
    expect(loadingPct({ elapsedSec: 10_000, targetSec: 60 })).toBe(LOADING_HOLD_PCT);
    expect(loadingPct({ elapsedSec: 10_000, targetSec: 60, holdPct: 92 })).toBe(92);
  });
  it('queued shows no number; finalizing sits at the ceiling; measured-only waits for the server', () => {
    expect(loadingPct({ state: 'queued', pct: 40 })).toBeNull();
    expect(loadingPct({ state: 'finalizing', elapsedSec: 1 })).toBe(LOADING_HOLD_PCT);
    expect(loadingPct({ measuredOnly: true, elapsedSec: 500 })).toBeNull();
    expect(loadingPct({ measuredOnly: true, pct: 30 })).toBe(30);
  });
  it('is the same curve GenerationProgress exports', () => {
    expect(reExported).toBe(easedPct);
    expect(easedPct(1e6, 10)).toBe(LOADING_HOLD_PCT);
  });
});

describe('LoadingCard', () => {
  it('shows the loop, the label and «42%», and no bar of any kind', () => {
    const { container } = render(<LoadingCard locale="ka" label="ვიდეო" pct={42} />);
    expect(container.querySelector('[data-testid="loading-loop-poster"]')).not.toBeNull();
    expect(screen.getByText('ვიდეო')).toBeTruthy();
    expect(screen.getByTestId('loading-card-pct').textContent).toBe('42%');
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    // No width-driven fill anywhere: the PRD took the bar away.
    expect([...container.querySelectorAll<HTMLElement>('*')].some((el) => /%$/.test(el.style.width))).toBe(false);
    expect(container.innerHTML).not.toMatch(/h-\[3px\]|h-2\.5|h-1\.5 w-full/);
  });

  it('queued: «რიგში · #2» and no number', () => {
    render(<LoadingCard locale="ka" label="მუსიკა" state="queued" queuePosition={2} />);
    expect(screen.getByText('რიგში · #2')).toBeTruthy();
    expect(screen.queryByTestId('loading-card-pct')).toBeNull();
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  });

  it('a pipeline stage is the quiet second line', () => {
    render(<LoadingCard locale="en" label="Video" pct={30} stage="⚠️ Rendering the clips" />);
    expect(screen.getByText('Rendering the clips')).toBeTruthy();
  });

  it('measured-only with no percent says it is in progress, without a number', () => {
    render(<LoadingCard locale="ru" label="Видео" measuredOnly elapsedSec={400} />);
    expect(screen.queryByTestId('loading-card-pct')).toBeNull();
    expect(screen.getByText('Готовится')).toBeTruthy();
  });

  it('cancel is a 44 px button that calls back, in the card and in the row', () => {
    const onCancel = jest.fn();
    const { rerender } = render(<LoadingCard locale="ka" label="ვიდეო" pct={5} onCancel={onCancel} />);
    const x = screen.getByRole('button', { name: 'გაუქმება' });
    expect(x.className).toContain('h-11');
    expect(x.className).toContain('w-11');
    fireEvent.click(x);
    rerender(<LoadingCard locale="ka" label="ვიდეო" pct={5} onCancel={onCancel} variant="row" />);
    fireEvent.click(screen.getByRole('button', { name: 'გაუქმება' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('keeps the result shape when given one, fills a parent as "fill", and can leave the loop out', () => {
    const { container, rerender } = render(<LoadingCard locale="ka" aspect="9:16" pct={10} />);
    expect((container.querySelector('[data-testid="loading-card"]') as HTMLElement).style.aspectRatio).toBe('9 / 16');
    rerender(<LoadingCard locale="ka" variant="fill" pct={10} />);
    expect(container.querySelector('[data-testid="loading-card"]')?.className).toContain('absolute inset-0');
    rerender(<LoadingCard locale="ka" pct={10} picture={false} />);
    expect(container.querySelector('[data-testid="loading-loop-poster"]')).toBeNull();
    expect(screen.getByTestId('loading-card-pct').textContent).toBe('10%');
  });

  it('announces a state change once, not every percent tick', () => {
    const { container, rerender } = render(<LoadingCard locale="en" label="Image" pct={10} />);
    const live = () => container.querySelector('[aria-live="polite"]')?.textContent;
    expect(live()).toBe('Image: In progress');
    rerender(<LoadingCard locale="en" label="Image" pct={11} />);
    expect(live()).toBe('Image: In progress');
    rerender(<LoadingCard locale="en" label="Image" state="finalizing" />);
    expect(live()).toBe('Image: Finishing…');
  });
});
