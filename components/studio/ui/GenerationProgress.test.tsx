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
import { render, screen } from '@testing-library/react';
import { GenerationProgress } from './GenerationProgress';

describe('the card owns every job state, not just "running"', () => {
  // MASTER TASK v3.1 §3.3 (Phase 2 PR 3): the number and a short label, and nothing else that reads the same guess.
  it('shows a live percentage and a short stage label while running, with no bar, checklist or clock', () => {
    const { container } = render(<GenerationProgress kind="image" locale="en" elapsed={10} />);
    // 10 s of a 65 s image is 31% on the eased curve, the second of its four stages.
    expect(screen.getByTestId('generation-progress-pct').textContent).toBe('31%');
    expect(screen.getByTestId('generation-progress-label').textContent).toBe('Painting the frame…');
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
    render(<GenerationProgress kind="image" locale="en" elapsed={0} state="queued" queuePosition={3} />);
    expect(screen.getByText('In queue: #3')).toBeTruthy();
    // ⚠️ A queued job has not started, so it must NOT print a number — that estimate would be climbing
    // against work that is not happening yet.
    expect(screen.queryByTestId('generation-progress-pct')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('reaches 100 only when the work is actually over', () => {
    const { container } = render(<GenerationProgress kind="image" locale="en" elapsed={5} state="done" />);
    expect(container.textContent).toContain('100');
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('surfaces the real failure reason rather than a generic word', () => {
    render(<GenerationProgress kind="image" locale="en" elapsed={9} state="failed" error="provider returned 500" />);
    expect(screen.getByText('provider returned 500')).toBeTruthy();
    // A job that did not finish prints no percentage: no number is honest about work that stopped.
    expect(screen.queryByTestId('generation-progress-pct')).toBeNull();
  });

  it('falls back to a plain label when a failure carries no reason', () => {
    render(<GenerationProgress kind="image" locale="en" elapsed={9} state="failed" />);
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('says stopped — not failed — for a cancel, because a cancel is not an error', () => {
    render(<GenerationProgress kind="image" locale="en" elapsed={4} state="canceled" />);
    expect(screen.getByText('Stopped')).toBeTruthy();
    expect(screen.queryByTestId('generation-progress-pct')).toBeNull();
  });
});

describe('the number is honest', () => {
  const pct = () => screen.getByTestId('generation-progress-pct').textContent;

  it('never reads 100 while the job runs, even when the server says 100', () => {
    render(<GenerationProgress kind="video" locale="en" elapsed={30} pct={100} />);
    expect(pct()).toBe('99%');
  });

  it('never goes back: a lower server percent holds the number where it was', () => {
    const { rerender } = render(<GenerationProgress kind="video" locale="en" elapsed={30} pct={64} />);
    expect(pct()).toBe('64%');
    rerender(<GenerationProgress kind="video" locale="en" elapsed={35} pct={40} />);
    expect(pct()).toBe('64%');
    rerender(<GenerationProgress kind="video" locale="en" elapsed={40} pct={70} />);
    expect(pct()).toBe('70%');
  });

  it('never goes back when a server percent arrives below the estimate already shown', () => {
    // 120 s of a 65 s image is 95% on the curve; the server's first report of 50 must not pull it down.
    const { rerender } = render(<GenerationProgress kind="image" locale="en" elapsed={120} />);
    expect(pct()).toBe('95%');
    rerender(<GenerationProgress kind="image" locale="en" elapsed={121} pct={50} />);
    expect(pct()).toBe('95%');
  });

  it('a new run on the same card starts from 0, not from the last job\'s number', () => {
    const { rerender } = render(<GenerationProgress kind="video" locale="en" elapsed={30} pct={80} />);
    expect(pct()).toBe('80%');
    rerender(<GenerationProgress kind="video" locale="en" elapsed={31} state="done" />);
    expect(pct()).toBe('100%');
    rerender(<GenerationProgress kind="video" locale="en" elapsed={2} pct={10} />);
    expect(pct()).toBe('10%');
  });

  it('pins the running card\'s markup', () => {
    const { container } = render(<GenerationProgress kind="music" locale="ka" elapsed={45} title="ჯაზი" />);
    expect(container.firstElementChild).toMatchSnapshot();
  });
});

describe('what the tray needs from it', () => {
  it('renders the job label, so a tray row still says WHAT is rendering', () => {
    render(<GenerationProgress kind="video" locale="en" elapsed={3} title="Jungle scene" compact />);
    expect(screen.getByText('Jungle scene')).toBeTruthy();
  });

  it('offers cancel while running or queued', () => {
    const { rerender } = render(
      <GenerationProgress kind="image" locale="en" elapsed={3} onCancel={() => {}} />,
    );
    expect(screen.getByLabelText('Cancel')).toBeTruthy();
    rerender(<GenerationProgress kind="image" locale="en" elapsed={0} state="queued" onCancel={() => {}} />);
    expect(screen.getByLabelText('Cancel')).toBeTruthy();
  });

  it('withdraws cancel once the job is terminal — there is nothing left to stop', () => {
    render(<GenerationProgress kind="image" locale="en" elapsed={3} state="done" onCancel={() => {}} />);
    expect(screen.queryByLabelText('Cancel')).toBeNull();
  });

  // The tray is a fixed-width panel; the chat bubble must not stretch across a desktop conversation.
  // That is the ONLY size-dependent behaviour in the card — everything else is identical everywhere,
  // which is the entire point of the unification.
  it('fills its container when compact and is clamped otherwise', () => {
    const { container: tray } = render(<GenerationProgress kind="image" locale="en" elapsed={1} compact />);
    expect(tray.firstElementChild?.className).toContain('w-full');
    expect(tray.firstElementChild?.className).not.toContain('max-w-[min(86vw,440px)]');

    const { container: bubble } = render(<GenerationProgress kind="image" locale="en" elapsed={1} />);
    expect(bubble.firstElementChild?.className).toContain('max-w-[min(86vw,440px)]');
  });

  it('keeps the number, the label and a small loop tile in compact form', () => {
    render(<GenerationProgress kind="image" locale="en" elapsed={12} compact />);
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
    render(<GenerationProgress kind="image" locale={locale} elapsed={2} state="done" />);
    expect(screen.getByText(expected)).toBeTruthy();
  });
});

describe('measured only (the tray\'s server-observed jobs, Video Core round 3)', () => {
  it('with no server percent it prints no number, and the progressbar is indeterminate', () => {
    const { container } = render(<GenerationProgress kind="video" locale="en" elapsed={40} measuredOnly />);
    expect(screen.queryByText('%')).toBeNull();
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(container.querySelector('[data-progress="indeterminate"]')).not.toBeNull();
  });
  it('the server\'s stage still heads the card', () => {
    render(<GenerationProgress kind="video" locale="ka" elapsed={40} measuredOnly status="კადრების შეერთება" />);
    expect(screen.getByText('კადრების შეერთება')).toBeTruthy();
    expect(screen.queryByText('%')).toBeNull();
  });
  it('a real server percent is printed as before', () => {
    render(<GenerationProgress kind="video" locale="en" elapsed={40} measuredOnly pct={42} />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('%')).toBeTruthy();
  });
  it('terminal states are unchanged', () => {
    render(<GenerationProgress kind="video" locale="en" elapsed={40} measuredOnly state="done" />);
    expect(screen.getByText('100')).toBeTruthy();
  });
  it('without the flag the eased estimate stays (every other studio)', () => {
    render(<GenerationProgress kind="video" locale="en" elapsed={40} />);
    expect(screen.getByText('%')).toBeTruthy();
  });
});
