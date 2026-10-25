/**
 * components/studio/clip/ClipAskCard — the one clip, asked before it is made (GG 2026-10-25: „like Gemini's Veo").
 * Pinned: the words are shown as typed; the price is ON Create and follows every chip; two or three photos leave only 8 s;
 * the 10 s clip shows its two resolutions with their prices; there is no switch for sound, music, subtitles or a narrator;
 * nothing can be changed once Create was pressed; a cancelled card says nothing was charged.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { ClipAskCard } from './ClipAskCard';
import { clipOrder, type ClipAskState } from './clipOrder';

const PHOTO = 'data:image/jpeg;base64,AAAA';
const ask = (over: Partial<Parameters<typeof clipOrder>[0]> = {}): ClipAskState =>
  clipOrder({ prompt: 'ბიჭი ამბობს: „გამარჯობა"', photos: [], seconds: 8, aspect: '9:16', tier: 'fast', ...over });

function mount(state: ClipAskState, locale = 'en') {
  const onChange = jest.fn(), onConfirm = jest.fn(), onCancel = jest.fn();
  const r = render(<ClipAskCard ask={state} locale={locale} onChange={onChange} onConfirm={onConfirm} onCancel={onCancel} />);
  return { ...r, onChange, onConfirm, onCancel };
}

test('shows the words as typed, the spec line and the price on Create', () => {
  const s = ask();
  mount(s);
  expect(screen.getByTestId('clip-prompt').textContent).toBe('„ბიჭი ამბობს: „გამარჯობა"“');
  expect(screen.getByTestId('clip-spec').textContent).toBe('8 s · 9:16 · 1080p · 1080×1920 · Veo 3.1 Fast');
  const create = screen.getByTestId('clip-confirm');
  expect(create.getAttribute('data-price')).toBe(String(s.credits));
  expect(create.getAttribute('data-live-guard')).toBe('spend');
  expect(create.textContent).toContain(`✦ ${s.credits}`);
  expect(screen.getByTestId('clip-len-8').getAttribute('aria-pressed')).toBe('true');
});

test('a chip hands back the same order with that one thing changed and priced again', () => {
  const { onChange } = mount(ask());
  fireEvent.click(screen.getByTestId('clip-len-10'));
  expect(onChange).toHaveBeenCalledTimes(1);
  const next = onChange.mock.calls[0][0] as ClipAskState;
  expect(next).toMatchObject({ seconds: 10, aspect: '9:16', credits: 69, phase: 'ask' });
  fireEvent.click(screen.getByTestId('clip-aspect-16x9'));
  expect((onChange.mock.calls[1][0] as ClipAskState).aspect).toBe('16:9');
});

test('the 10 s clip shows its two resolutions with their prices', () => {
  const { onChange } = mount(ask({ seconds: 10 }));
  expect(screen.getByTestId('clip-res-720p').textContent).toContain('✦ 69');
  expect(screen.getByTestId('clip-res-1080p').textContent).toContain('✦ 102');
  fireEvent.click(screen.getByTestId('clip-res-1080p'));
  expect((onChange.mock.calls[0][0] as ClipAskState).credits).toBe(102);
});

test('two photos are references: only 8 s can be picked, and the card says what they are', () => {
  const { container } = mount(ask({ photos: [PHOTO, PHOTO] }));
  expect(screen.getByTestId('clip-photos').querySelectorAll('img')).toHaveLength(2);
  for (const s of [4, 6, 10]) expect((screen.getByTestId(`clip-len-${s}`) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByTestId('clip-len-8') as HTMLButtonElement).disabled).toBe(false);
  expect(container.textContent).toContain('kept (8 s)');
  expect(screen.queryByTestId('clip-res-720p')).toBeNull();
});

test('there is no switch for sound, music, subtitles or a narrator: the sound follows the prompt', () => {
  const { container } = mount(ask(), 'en');
  expect(container.querySelectorAll('[role="switch"], input[type="checkbox"]')).toHaveLength(0);
  expect(container.textContent).not.toMatch(/narrat|subtitle|music|voice/i);
});

test('Create and Cancel call back; once Create is pressed nothing can change any more', () => {
  const { onConfirm, onCancel, rerender, onChange } = mount(ask());
  fireEvent.click(screen.getByTestId('clip-confirm'));
  fireEvent.click(screen.getByTestId('clip-cancel'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  rerender(<ClipAskCard ask={{ ...ask(), phase: 'starting' }} locale="en" onChange={onChange} onConfirm={onConfirm} onCancel={onCancel} />);
  expect((screen.getByTestId('clip-confirm') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByTestId('clip-cancel')).toBeNull();
  fireEvent.click(screen.getByTestId('clip-len-4'));
  expect(onChange).not.toHaveBeenCalled();
  rerender(<ClipAskCard ask={{ ...ask(), phase: 'running' }} locale="en" onChange={onChange} onConfirm={onConfirm} onCancel={onCancel} />);
  expect(screen.queryByTestId('clip-confirm')).toBeNull();
  expect(screen.getByTestId('clip-running').textContent).toContain('Veo 3.1 Fast');
});

test('a cancelled card says nothing was charged, in Georgian by default', () => {
  mount({ ...ask(), phase: 'cancelled' }, 'ka');
  expect(screen.getByTestId('clip-cancelled').textContent).toBe('გაუქმდა. თანხა არ ჩამოგეჭრა.');
  expect(screen.queryByTestId('clip-confirm')).toBeNull();
});
