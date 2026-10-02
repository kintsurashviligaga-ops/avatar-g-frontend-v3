/**
 * @jest-environment jsdom
 *
 * The toasts (ready · failed · one-liners) and the list sheet — the two ways back to a report once the card has scrolled away.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ListSheet } from './ListSheet';
import { ResearchToasts } from './ResearchToasts';
import { getResearchState, researchActions, resetResearchStoreForTests } from './store';
import { done, job } from './testing';

beforeEach(() => {
  resetResearchStoreForTests();
  try { window.localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => { jest.useRealTimers(); });

describe('ResearchToasts', () => {
  test('a finished report: title, what it is and how many sources, and one tap on Open lands in the report', () => {
    act(() => researchActions.ingestList([done({ id: 'a', title: 'EV market', sourcesCount: 7 })], { announce: true }));
    render(<ResearchToasts locale="en" />);
    const toast = screen.getByTestId('research-toast');
    expect(toast.getAttribute('data-kind')).toBe('ready');
    expect(toast.textContent).toContain('Your report is ready');
    expect(toast.textContent).toContain('EV market');
    expect(toast.textContent).toContain('7 sources');
    fireEvent.click(screen.getByTestId('research-toast-open'));
    expect(getResearchState().viewer).toBe('a');
    expect(getResearchState().toasts).toHaveLength(0);
  });

  test('a failed job says what happened to the credits, with no Open button', () => {
    act(() => researchActions.ingestList([job({ id: 'f', status: 'failed', errorCode: 'provider_failed', refunded: true, completedAt: new Date().toISOString() })], { announce: true }));
    render(<ResearchToasts locale="en" />);
    const toast = screen.getByTestId('research-toast');
    expect(toast.getAttribute('data-kind')).toBe('failed');
    expect(toast.textContent).toContain('Research could not finish');
    expect(toast.textContent).toContain('Your credits were returned.');
    expect(within(toast).queryByTestId('research-toast-open')).toBeNull();
  });

  test('every toast has a 44 px dismiss, and it removes the toast', () => {
    act(() => researchActions.pushInfo('started'));
    render(<ResearchToasts locale="ru" />);
    const dismiss = screen.getByRole('button', { name: 'Закрыть' });
    expect(dismiss.className).toContain('h-11');
    expect(dismiss.className).toContain('w-11');
    fireEvent.click(dismiss);
    expect(screen.queryByTestId('research-toast')).toBeNull();
  });

  test('toasts dismiss themselves: a one-liner after a few seconds, a report notice after fifteen', () => {
    jest.useFakeTimers();
    act(() => { researchActions.pushInfo('started'); researchActions.ingestList([done({ id: 'a' })], { announce: true }); });
    render(<ResearchToasts locale="en" />);
    expect(screen.getAllByTestId('research-toast')).toHaveLength(2);
    act(() => { jest.advanceTimersByTime(6_500); });
    expect(screen.getAllByTestId('research-toast')).toHaveLength(1);
    expect(screen.getByTestId('research-toast').getAttribute('data-kind')).toBe('ready');
    act(() => { jest.advanceTimersByTime(9_000); });
    expect(screen.queryByTestId('research-toast')).toBeNull();
  });

  test('a hovered toast waits: the timer does not take it from under the pointer', () => {
    jest.useFakeTimers();
    act(() => researchActions.ingestList([done({ id: 'a' })], { announce: true }));
    render(<ResearchToasts locale="en" />);
    fireEvent.mouseEnter(screen.getByTestId('research-toast'));
    act(() => { jest.advanceTimersByTime(40_000); });
    expect(screen.getByTestId('research-toast')).toBeTruthy();
    fireEvent.mouseLeave(screen.getByTestId('research-toast'));
    act(() => { jest.advanceTimersByTime(16_000); });
    expect(screen.queryByTestId('research-toast')).toBeNull();
  });

  test('the live region is polite and sits under the safe area', () => {
    const { container } = render(<ResearchToasts locale="en" />);
    const region = container.firstElementChild as HTMLElement;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.style.paddingTop).toContain('safe-area-inset-top');
  });
});

describe('ListSheet', () => {
  test('newest first; each row says its state; a ready one opens the report', () => {
    const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    act(() => {
      researchActions.upsertJob(done({ id: 'old', title: 'Old report', createdAt: t(600), sourcesCount: 4 }));
      researchActions.upsertJob(job({ id: 'run', prompt: 'Still running question', createdAt: t(3) }));
      researchActions.upsertJob(job({ id: 'bad', status: 'failed', errorCode: 'timeout', prompt: 'A failed one', createdAt: t(60) }));
      researchActions.ingestList([]); // listLoaded
    });
    render(<ListSheet locale="en" />);
    const rows = screen.getAllByTestId('research-list-row');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Still running question'),
      expect.stringContaining('A failed one'),
      expect.stringContaining('Old report'),
    ]);
    expect(rows[0]!.textContent).toContain('Running');
    expect(rows[1]!.textContent).toContain('Could not finish');
    expect(rows[2]!.textContent).toContain('Ready');
    expect(rows[2]!.textContent).toContain('4 sources');
    fireEvent.click(rows[2]!);
    expect(getResearchState().viewer).toBe('old');
    expect(getResearchState().list).toBe(false);
  });

  test('an empty list says so; New research appears only when the feature exists; Connectors always opens', () => {
    act(() => researchActions.ingestList([]));
    const { rerender } = render(<ListSheet locale="en" />);
    expect(screen.getByText('No research yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /New research/ })).toBeNull();
    act(() => researchActions.setCredits(120)); // no caps yet → no-op, still hidden
    expect(screen.queryByRole('button', { name: /New research/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Connectors/ }));
    expect(getResearchState().connectors).toBe(true);
    rerender(<ListSheet locale="en" />);
  });
});
