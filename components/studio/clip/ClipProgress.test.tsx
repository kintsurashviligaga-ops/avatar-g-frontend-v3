/**
 * components/studio/clip/ClipProgress — the clip and edit cards' percent (GG 2026-10-26 08:27Z). Pinned: the number is
 * the job's milestone (§3.3), read from the status poll's `state`; it never goes back; there is no 100 on the card.
 */
import { render, screen } from '@testing-library/react';
import { CLIP_STEP_PCT, ClipProgress, clipStepFromState } from './ClipProgress';

test('the status poll names the step: `delivering` means Google rendered it; anything else is still rendering', () => {
  expect(clipStepFromState('delivering')).toBe('finishing');
  expect(clipStepFromState('processing')).toBe('rendering');
  expect(clipStepFromState(undefined)).toBe('rendering');
  expect(CLIP_STEP_PCT).toEqual({ rendering: 10, finishing: 90 });
  expect(Object.values(CLIP_STEP_PCT).every((p) => p < 100)).toBe(true);
});

test('the number never goes back, and without a start time there is no clock', () => {
  const { rerender } = render(<ClipProgress step="finishing" label="Done soon" testId="p" />);
  expect(screen.getByTestId('p-pct').textContent).toBe('90%');
  rerender(<ClipProgress step="rendering" label="Rendering" testId="p" />);
  expect(screen.getByTestId('p-pct').textContent).toBe('90%');
  expect(screen.queryByTestId('p-clock')).toBeNull();
  expect(screen.getByTestId('p').getAttribute('aria-valuetext')).toBe('90% · Rendering');
});
