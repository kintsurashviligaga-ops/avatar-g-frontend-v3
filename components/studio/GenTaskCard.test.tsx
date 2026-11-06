/**
 * @jest-environment jsdom
 *
 * A render in the chat as Agent G's timeline card: open with Stop while it works, folded to one line once it is done.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { GenTaskCard } from './GenTaskCard';

test('in flight: the steps are open, the render spins and Stop stops this job', () => {
  const onStop = jest.fn();
  render(<GenTaskCard input={{ kind: 'image', phase: 'working', clock: { from: Date.now() } }} locale="ka" onStop={onStop} />);
  const card = screen.getByTestId('gen-image-card');
  expect(card.getAttribute('data-phase')).toBe('working');
  expect(card.querySelector('[data-step="render"]')!.getAttribute('data-state')).toBe('active');
  expect(card.querySelector('[data-icon="spinner"]')).not.toBeNull();
  expect(document.getElementById('gen-image-card-steps')!.getAttribute('data-folded')).toBe('false');
  fireEvent.click(screen.getByTestId('gen-image-stop'));
  expect(onStop).toHaveBeenCalledTimes(1);
});

test('done: folded to its header (count, „მზადაა", the time), every step checked, no Stop', () => {
  render(<GenTaskCard input={{ kind: 'video', phase: 'done', clock: { from: 0, to: 89_000 } }} locale="ka" onStop={() => {}} />);
  const card = screen.getByTestId('gen-video-card');
  expect(document.getElementById('gen-video-card-steps')!.getAttribute('data-folded')).toBe('true');
  expect(card.textContent).toContain('3/3 ნაბიჯი');
  expect(card.textContent).toContain('მზადაა');
  expect(card.textContent).toContain('1:29');
  expect(card.querySelectorAll('[data-icon="check"]').length).toBe(3);
  expect(screen.queryByTestId('gen-video-stop')).toBeNull();
});
