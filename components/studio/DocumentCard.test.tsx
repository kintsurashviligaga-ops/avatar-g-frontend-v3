import { act, render, screen } from '@testing-library/react';
import { DocumentWorking } from './DocumentCard';

describe('DocumentWorking', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-31T12:00:00Z')); });
  afterEach(() => { jest.useRealTimers(); });

  it('shows a spinner status with the working line and counts the seconds', () => {
    render(<DocumentWorking text="ვწერ დოკუმენტს და ვამზადებ PDF-ს…" locale="ka" startedAt={Date.now()} />);
    const box = screen.getByTestId('document-working');
    expect(box.getAttribute('role')).toBe('status');
    expect(box.textContent).toContain('ვწერ დოკუმენტს და ვამზადებ PDF-ს…');
    expect(box.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.getByTestId('document-working-secs').textContent).toBe('0 წმ');
    act(() => { jest.advanceTimersByTime(3000); });
    expect(screen.getByTestId('document-working-secs').textContent).toBe('3 წმ');
  });

  it('uses the locale unit', () => {
    render(<DocumentWorking text="Writing…" locale="en" startedAt={Date.now() - 5000} />);
    expect(screen.getByTestId('document-working-secs').textContent).toBe('5 s');
  });
});
