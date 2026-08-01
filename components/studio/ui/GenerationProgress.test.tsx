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
  it('shows a live percentage and the remaining estimate while running', () => {
    render(<GenerationProgress kind="image" locale="en" elapsed={10} />);
    expect(screen.getByText('%')).toBeTruthy();
    expect(screen.getByText('remaining')).toBeTruthy();
  });

  it('shows the queue position instead of a fake percentage when queued', () => {
    render(<GenerationProgress kind="image" locale="en" elapsed={0} state="queued" queuePosition={3} />);
    expect(screen.getByText('In queue: #3')).toBeTruthy();
    // ⚠️ A queued job has not started, so it must NOT advertise time remaining — that estimate would be
    // counting down against work that is not happening yet.
    expect(screen.queryByText('remaining')).toBeNull();
  });

  it('reaches 100 only when the work is actually over', () => {
    const { container } = render(<GenerationProgress kind="image" locale="en" elapsed={5} state="done" />);
    expect(container.textContent).toContain('100');
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('surfaces the real failure reason rather than a generic word', () => {
    render(<GenerationProgress kind="image" locale="en" elapsed={9} state="failed" error="provider returned 500" />);
    expect(screen.getByText('provider returned 500')).toBeTruthy();
  });

  it('falls back to a plain label when a failure carries no reason', () => {
    render(<GenerationProgress kind="image" locale="en" elapsed={9} state="failed" />);
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('says stopped — not failed — for a cancel, because a cancel is not an error', () => {
    render(<GenerationProgress kind="image" locale="en" elapsed={4} state="canceled" />);
    expect(screen.getByText('Stopped')).toBeTruthy();
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

  it('drops the stage checklist in compact form but keeps the number and the bar', () => {
    const { container } = render(<GenerationProgress kind="image" locale="en" elapsed={12} compact />);
    expect(container.querySelector('ul')).toBeNull();
    expect(screen.getByText('%')).toBeTruthy();
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
