/**
 * @jest-environment jsdom
 *
 * Segmented — a radio group that behaves like one: ONE Tab stop, arrows move the choice and the focus together,
 * disabled options are skipped (a music video's format is locked to 9:16).
 */
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Segmented } from './Segmented';

function Harness({ locked = false, initial = '9:16' }: { locked?: boolean; initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <Segmented label="ფორმატი" cols="grid-cols-4" options={['9:16', '1:1', '16:9', '4:5']} value={v} onChange={setV}
      isDisabled={(a) => locked && a !== '9:16'} />
  );
}

describe('Segmented', () => {
  it('is a named radio group with the checked option as its only Tab stop', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'ფორმატი' })).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it('arrows move the choice and the focus, wrapping at the ends; Home and End jump', () => {
    render(<Harness />);
    const first = screen.getByRole('radio', { name: '9:16' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: '1:1' }).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '1:1' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: '4:5' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByRole('radio', { name: '9:16' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('radio', { name: '4:5' }).getAttribute('aria-checked')).toBe('true');
  });

  it('skips disabled options, and stays reachable when nothing is checked', () => {
    const { unmount } = render(<Harness locked />);
    const only = screen.getByRole('radio', { name: '9:16' });
    only.focus();
    fireEvent.keyDown(only, { key: 'ArrowRight' });
    expect(only.getAttribute('aria-checked')).toBe('true'); // every other option is locked
    unmount();
    render(<Harness initial="21:9" />); // a value the group does not offer
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([0, -1, -1, -1]);
  });
});
