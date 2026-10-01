/**
 * @jest-environment jsdom
 *
 * StyleChips — the music panel's style strip became a multi-select of up to three (owner plan 2b). The first pick
 * leads, the last cannot be removed, and the cap disables the rest instead of evicting an earlier pick.
 */
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StyleChips } from './StyleChips';

const OPTIONS = [
  { id: 'georgian folk', label: 'Georgian Folk' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'rock', label: 'Rock' },
  { id: 'pop', label: 'Pop' },
];

function Harness({ initial, onChange }: { initial: string[]; onChange?: (v: string[]) => void }) {
  const [v, setV] = useState(initial);
  return <StyleChips label="Style — pick up to 3" options={OPTIONS} value={v} onChange={(n) => { onChange?.(n); setV(n); }} />;
}

const chip = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

test('a named group of toggle chips; the picked ones are pressed, and the counter says how many of three', () => {
  render(<Harness initial={['jazz']} />);
  expect(screen.getByRole('group', { name: 'Style — pick up to 3' })).toBeTruthy();
  expect(chip('Jazz').getAttribute('aria-pressed')).toBe('true');
  expect(chip('Rock').getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByText('1/3')).toBeTruthy();
});

test('picks append in order (the first leads), and a second tap removes', () => {
  const seen: string[][] = [];
  render(<Harness initial={['jazz']} onChange={(v) => seen.push(v)} />);
  fireEvent.click(chip('Georgian Folk'));
  fireEvent.click(chip('Rock'));
  expect(seen.at(-1)).toEqual(['jazz', 'georgian folk', 'rock']);
  fireEvent.click(chip('Jazz'));
  expect(seen.at(-1)).toEqual(['georgian folk', 'rock']);
});

test('the last style cannot be removed — an engine needs one', () => {
  const onChange = jest.fn();
  render(<Harness initial={['pop']} onChange={onChange} />);
  fireEvent.click(chip('Pop'));
  expect(onChange).not.toHaveBeenCalled();
  expect(chip('Pop').getAttribute('aria-pressed')).toBe('true');
});

test('at three, the unpicked chips are disabled rather than evicting an earlier pick; dropping one frees them', () => {
  render(<Harness initial={['georgian folk', 'jazz', 'rock']} />);
  expect(screen.getByText('3/3')).toBeTruthy();
  expect(chip('Pop').disabled).toBe(true);
  expect(chip('Jazz').disabled).toBe(false); // a picked chip can still be removed
  fireEvent.click(chip('Jazz'));
  expect(chip('Pop').disabled).toBe(false);
  expect(screen.getByText('2/3')).toBeTruthy();
});

test('the strip scrolls inside itself and can shrink — it never widens the page', () => {
  render(<Harness initial={['jazz']} />);
  const strip = screen.getByRole('group');
  expect(strip.className).toContain('overflow-x-auto');
  expect(strip.className).toContain('min-w-0');
});
