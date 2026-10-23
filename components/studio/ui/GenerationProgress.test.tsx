/**
 * @jest-environment jsdom
 *
 * ONE CARD, EVERY STATE, EVERY SURFACE.
 *
 * ⚠️ WHY THIS IS ASSERTED RATHER THAN EYEBALLED. The bug these tests lock down was invisible on any
 * single device: the chat bubble and the floating tray were two SEPARATE implementations of "a job is
 * running", so the difference only appeared when a phone and a desktop were held side by side — which is
 * exactly how the user found it. A screenshot of one device can never catch that class of regression, so
 * the contract is pinned here instead: the tray and the bubble must render the SAME component, and that
 * component must handle every state a job can reach.
 */
import { act, render, screen } from '@testing-library/react';
import { GenerationProgress } from './GenerationProgress';

describe('the card owns every job state, not just "running"', () => {
  // MASTER TASK v3.1 §3.3 (Phase 2 PR 3): the number and a short label, and nothing else that reads the same guess.
  it('shows the server\'s percentage and its stage while running, with no bar, checklist or clock', () => {
    const { container } = render(<GenerationProgress locale="en" pct={31} status="Painting the frame…" />);
    expect(screen.getByTestId('generation-progress-pct').textContent).toBe('31%');
    expect(screen.getByTestId('generation-progress-label').textContent).toBe('Painting the frame…');
    expect(container.querySelector('[data-progress="measured"]')).not.toBeNull();
    expect(container.querySelector('ul, li')).toBeNull();
    // Nothing on the card animates on its own; the loop is the only motion, and it holds still under reduced motion.
    expect(container.querySelector('[class*="animate-"]')).toBeNull();
    expect(container.textContent).not.toMatch(/remaining|\d:\d\d/);
    // One progressbar, and it is the number itself — no second, drawn bar beside it.
    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(1);
    expect(bars[0]!.getAttribute('aria-valuenow')).toBe('31');
    expect(bars[0]!.getAttribute('aria-valuetext')).toBe('31% · Painting the frame…');
  });

  it('shows the queue position instead of a fake percentage when queued', () => {
    render(<GenerationProgress locale="en" state="queued" queuePosition={3} />);
    expect(screen.getByText('In queue: #3')).toBeTruthy();
    // ⚠️ A queued job has not started, so it must NOT print a number — that estimate would be climbing
    // against work that is not happening yet.
    expect(screen.queryByTestId('generation-progress-pct')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('reaches 100 only when the work is actually over', () => {
    const { container } = render(<GenerationProgress locale="en" state="done" />);
    expect(container.textContent).toContain('100');
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('surfaces the real failure reason rather than a generic word', () => {
    render(<GenerationProgress locale="en" state="failed" error="provider returned 500" />);
    expect(screen.getByText('provider returned 500')).toBeTruthy();
    // A job that did not finish prints no percentage: no number is honest about work that stopped.
    expect(screen.queryByTestId('generation-progress-pct')).toBeNull();
  });

  it('falls back to a plain label when a failure carries no reason', () => {
    render(<GenerationProgress locale="en" state="failed" />);
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('says stopped — not failed — for a cancel, because a cancel is not an error', () => {
    render(<GenerationProgress locale="en" state="canceled" />);
    expect(screen.getByText('Stopped')).toBeTruthy();
    expect(screen.queryByTestId('generation-progress-pct')).toBeNull();
  });
});

describe('the number is honest', () => {
  const pct = () => screen.getByTestId('generation-progress-pct').textContent;

  it('never reads 100 while the job runs, even when the server says 100', () => {
    render(<GenerationProgress locale="en" pct={100} />);
    expect(pct()).toBe('99%');
  });

  it('never goes back: a lower server percent holds the number where it was', () => {
    const { rerender } = render(<GenerationProgress locale="en" pct={64} />);
    expect(pct()).toBe('64%');
    rerender(<GenerationProgress locale="en" pct={40} />);
    expect(pct()).toBe('64%');
    rerender(<GenerationProgress locale="en" pct={70} />);
    expect(pct()).toBe('70%');
  });

  it('keeps the last real value when the server stops reporting', () => {
    const { rerender } = render(<GenerationProgress locale="en" pct={50} />);
    expect(pct()).toBe('50%');
    rerender(<GenerationProgress locale="en" />);
    expect(pct()).toBe('50%');
  });

  it('a new run on the same card starts from 0, not from the last job\'s number', () => {
    const { rerender } = render(<GenerationProgress locale="en" pct={80} />);
    expect(pct()).toBe('80%');
    rerender(<GenerationProgress locale="en" state="done" />);
    expect(pct()).toBe('100%');
    rerender(<GenerationProgress locale="en" pct={10} />);
    expect(pct()).toBe('10%');
  });

  it('pins the running card\'s markup', () => {
    const { container } = render(<GenerationProgress locale="ka" title="ჯაზი" />);
    expect(container.firstElementChild).toMatchSnapshot();
  });
});

describe('what the tray needs from it', () => {
  it('renders the job label, so a tray row still says WHAT is rendering', () => {
    render(<GenerationProgress locale="en" title="Jungle scene" compact />);
    expect(screen.getByText('Jungle scene')).toBeTruthy();
  });

  it('offers cancel while running or queued', () => {
    const { rerender } = render(
      <GenerationProgress locale="en" onCancel={() => {}} />,
    );
    expect(screen.getByLabelText('Cancel')).toBeTruthy();
    rerender(<GenerationProgress locale="en" state="queued" onCancel={() => {}} />);
    expect(screen.getByLabelText('Cancel')).toBeTruthy();
  });

  it('withdraws cancel once the job is terminal — there is nothing left to stop', () => {
    render(<GenerationProgress locale="en" state="done" onCancel={() => {}} />);
    expect(screen.queryByLabelText('Cancel')).toBeNull();
  });

  // The tray is a fixed-width panel; the chat bubble must not stretch across a desktop conversation.
  // That is the ONLY size-dependent behaviour in the card — everything else is identical everywhere,
  // which is the entire point of the unification.
  it('fills its container when compact and is clamped otherwise', () => {
    const { container: tray } = render(<GenerationProgress locale="en" compact />);
    expect(tray.firstElementChild?.className).toContain('w-full');
    expect(tray.firstElementChild?.className).not.toContain('max-w-[min(86vw,440px)]');

    const { container: bubble } = render(<GenerationProgress locale="en" />);
    expect(bubble.firstElementChild?.className).toContain('max-w-[min(86vw,440px)]');
  });

  it('keeps the number, the label and a small loop tile in compact form', () => {
    render(<GenerationProgress locale="en" compact />);
    expect(screen.getByTestId('generation-progress-pct')).toBeTruthy();
    expect(screen.getByTestId('generation-progress-label')).toBeTruthy();
    expect(screen.getByTestId('generation-progress-loop').className).toContain('w-[30px]');
  });
});

describe('localisation', () => {
  it.each([
    ['ka' as const, 'მზადაა'],
    ['ru' as const, 'Готово'],
    ['en' as const, 'Ready'],
  ])('speaks %s', (locale, expected) => {
    render(<GenerationProgress locale={locale} state="done" />);
    expect(screen.getByText(expected)).toBeTruthy();
  });
});

describe('no server percent yet (MASTER TASK v3.1 §3.3: no time-driven precision)', () => {
  afterEach(() => jest.useRealTimers());

  it('reads 0% under a short waiting label, and the progressbar says so', () => {
    const { container } = render(<GenerationProgress locale="en" />);
    expect(screen.getByTestId('generation-progress-pct').textContent).toBe('0%');
    expect(screen.getByTestId('generation-progress-label').textContent).toBe('In progress');
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(bar.getAttribute('aria-valuetext')).toBe('0% · In progress');
    expect(container.querySelector('[data-progress="waiting"]')).not.toBeNull();
  });

  it('the server\'s stage still heads the card', () => {
    render(<GenerationProgress locale="ka" status="კადრების შეერთება" />);
    expect(screen.getByText('კადრების შეერთება')).toBeTruthy();
    expect(screen.getByTestId('generation-progress-pct').textContent).toBe('0%');
  });

  it('the clock moves nothing: ten minutes later it still reads 0%', () => {
    jest.useFakeTimers();
    const { rerender } = render(<GenerationProgress locale="en" />);
    act(() => { jest.advanceTimersByTime(600_000); });
    rerender(<GenerationProgress locale="en" />);
    expect(screen.getByTestId('generation-progress-pct').textContent).toBe('0%');
  });
});
