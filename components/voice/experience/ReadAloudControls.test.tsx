/**
 * The read-aloud row (behind NEXT_PUBLIC_VOICE_EXPERIENCE_V2), Phase 7.5 polish: app tokens, speed chips, a progress bar.
 * The reader itself (lib/voice/experience/readAloud) is mocked: these pin what the row shows and what it asks for.
 */
import { fireEvent, render, screen } from '@testing-library/react';

const reader = { play: jest.fn(() => true), retry: jest.fn(), pause: jest.fn(), resume: jest.fn(), stop: jest.fn(), setSpeed: jest.fn() };
let owner = '';
let speech: Record<string, unknown> = { owner: null, status: 'idle', index: 0, total: 0 };
jest.mock('../../../lib/speech/useSpeech', () => ({ useSpeechState: () => speech }));
jest.mock('../../../lib/voice/experience/readAloud', () => {
  const real = jest.requireActual('../../../lib/voice/experience/readAloud');
  return { ...real, createReadAloud: (o: string) => { owner = o; return reader; } };
});

import { ReadAloudControls, READ_ALOUD_SPEEDS } from './ReadAloudControls';

beforeEach(() => { jest.clearAllMocks(); speech = { owner: null, status: 'idle', index: 0, total: 0 }; });

test('idle: Read is the one live action, speed chips with 1× checked, no bar, no hard-coded black or white', () => {
  const { container } = render(<ReadAloudControls text="გამარჯობა" locale="en" />);
  expect((screen.getByTestId('read-aloud-pause') as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByTestId('read-aloud-stop') as HTMLButtonElement).disabled).toBe(true);
  const chips = screen.getAllByRole('radio');
  expect(chips.map((c) => c.textContent)).toEqual(READ_ALOUD_SPEEDS.map((n) => `${n}×`));
  expect(screen.getByRole('radio', { name: '1×' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(container.innerHTML).not.toMatch(/bg-black|text-white|border-white/);
  fireEvent.click(screen.getByTestId('read-aloud-all'));
  expect(reader.play).toHaveBeenCalledWith('გამარჯობა', 1);
});

test('a speed chip changes the speed of this read and the next', () => {
  render(<ReadAloudControls text="text" locale="en" />);
  fireEvent.click(screen.getByTestId('read-aloud-speed-1.5'));
  expect(reader.setSpeed).toHaveBeenCalledWith(1.5);
  expect(screen.getByRole('radio', { name: '1.5×' }).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByTestId('read-aloud-all'));
  expect(reader.play).toHaveBeenCalledWith('text', 1.5);
});

test('an empty text is refused and says so', () => {
  render(<ReadAloudControls text="   " locale="en" />);
  reader.play.mockReturnValueOnce(false);
  fireEvent.click(screen.getByTestId('read-aloud-all'));
  expect(screen.getByRole('status').textContent).toContain('Reading could not start');
});

test('Georgian by default', () => {
  render(<ReadAloudControls text="t" />);
  expect(screen.getByTestId('read-aloud-all').textContent).toContain('სრულად წაკითხვა');
});

test('while reading: a bar for chunks read, Pause and Stop live; paused offers Resume', () => {
  const { rerender } = render(<ReadAloudControls text="long text" locale="en" />);
  speech = { owner, status: 'playing', index: 1, total: 4 };
  rerender(<ReadAloudControls text="long text" locale="en" />);
  const bar = screen.getByRole('progressbar');
  expect(bar.getAttribute('aria-valuenow')).toBe('2');
  expect(bar.getAttribute('aria-valuemax')).toBe('4');
  expect((bar.firstChild as HTMLElement).style.width).toBe('50%');
  expect(screen.getByRole('status').textContent).toBe('Reading · 2/4');
  fireEvent.click(screen.getByTestId('read-aloud-pause'));
  expect(reader.pause).toHaveBeenCalled();
  speech = { owner, status: 'paused', index: 1, total: 4 };
  rerender(<ReadAloudControls text="long text" locale="en" />);
  fireEvent.click(screen.getByTestId('read-aloud-pause'));
  expect(reader.resume).toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('read-aloud-stop'));
  expect(reader.stop).toHaveBeenCalled();
});
