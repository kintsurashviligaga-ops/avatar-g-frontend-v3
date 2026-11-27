import { act, render, screen } from '@testing-library/react';
import { LibraryLoading } from './LibraryLoading';

describe('LibraryLoading', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows card placeholders at once and the slow line only after the wait', () => {
    render(<LibraryLoading lang="ka" slowMs={5000} />);
    expect(screen.getByTestId('library-loading').getAttribute('role')).toBe('status');
    expect(screen.queryByTestId('library-loading-slow')).toBeNull();
    act(() => { jest.advanceTimersByTime(5000); });
    expect(screen.getByTestId('library-loading-slow').textContent).toContain('იტვირთება');
  });

  it('speaks the page language', () => {
    render(<LibraryLoading lang="ru" slowMs={0} />);
    act(() => { jest.advanceTimersByTime(1); });
    expect(screen.getByTestId('library-loading-slow').textContent).toContain('загружаются');
  });
});
