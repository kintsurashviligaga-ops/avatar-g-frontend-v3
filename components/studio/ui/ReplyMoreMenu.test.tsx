/**
 * @jest-environment jsdom
 *
 * ReplyMoreMenu — the „⋯“ that holds what the PRD (2026-10-18) took off a reply's row: it is a menu button, its items
 * run and close it, a rating shows as checked, and Escape / a tap outside close it with nothing run.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { Share2, ThumbsUp } from 'lucide-react';
import { ReplyMoreMenu } from './ReplyMoreMenu';

function setup(checked = false) {
  const good = jest.fn();
  const share = jest.fn();
  render(
    <div>
      <ReplyMoreMenu locale="ka" items={[
        { id: 'good', label: 'კარგი პასუხი', icon: ThumbsUp, onSelect: good, checked },
        { id: 'share', label: 'გაზიარება', icon: Share2, onSelect: share },
      ]} />
      <p>outside</p>
    </div>,
  );
  return { good, share, trigger: screen.getByRole('button', { name: 'მეტი' }) };
}

test('a closed menu button: one „მეტი“, no items on screen', () => {
  const { trigger } = setup();
  expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('menu')).toBeNull();
});

test('opens with focus on the first item; a choice runs once and closes the menu', () => {
  const { trigger, share, good } = setup();
  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(document.activeElement).toBe(screen.getByRole('menuitemcheckbox', { name: 'კარგი პასუხი' }));
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'გაზიარება' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'გაზიარება' }));
  expect(share).toHaveBeenCalledTimes(1);
  expect(good).not.toHaveBeenCalled();
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test('a rating already given is announced as checked', () => {
  const { trigger } = setup(true);
  fireEvent.click(trigger);
  expect(screen.getByRole('menuitemcheckbox', { name: 'კარგი პასუხი' }).getAttribute('aria-checked')).toBe('true');
});

test('Escape and a tap outside close it; nothing runs', () => {
  const { trigger, good, share } = setup();
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByText('outside'));
  expect(screen.queryByRole('menu')).toBeNull();
  expect(good).not.toHaveBeenCalled();
  expect(share).not.toHaveBeenCalled();
});

test('English and Russian name the button', () => {
  const { rerender } = render(<ReplyMoreMenu locale="en" items={[{ id: 's', label: 'Share', icon: Share2, onSelect: () => {} }]} />);
  expect(screen.getByRole('button', { name: 'More' })).toBeTruthy();
  rerender(<ReplyMoreMenu locale="ru" items={[{ id: 's', label: 'Share', icon: Share2, onSelect: () => {} }]} />);
  expect(screen.getByRole('button', { name: 'Ещё' })).toBeTruthy();
});
