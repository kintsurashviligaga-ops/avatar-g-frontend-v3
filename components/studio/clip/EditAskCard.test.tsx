/**
 * components/studio/clip/EditAskCard — an uploaded video, edited or extended, asked before it is made (GG 2026-10-25).
 * Pinned: the words are shown as typed and the video plays on the card; the price is ON Create and follows every chip;
 * extend shows its four lengths and edit none; an op the video cannot take is disabled; nothing can be changed once Create
 * was pressed; a cancelled card says nothing was charged.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { EditAskCard } from './EditAskCard';
import { editOrder, type EditAskState } from './editOrder';

const VIDEO = { url: 'blob:https://myavatar.ge/1', mimeType: 'video/mp4', name: 'clip.mp4', poster: 'data:image/jpeg;base64,AAAA' };
const ask = (over: Partial<Parameters<typeof editOrder>[0]> = {}): EditAskState =>
  editOrder({ op: 'edit', prompt: 'გააღამე', video: VIDEO, inputSec: 5, ...over });

function mount(state: EditAskState, locale = 'en') {
  const onChange = jest.fn(), onConfirm = jest.fn(), onCancel = jest.fn();
  const r = render(<EditAskCard ask={state} locale={locale} onChange={onChange} onConfirm={onConfirm} onCancel={onCancel} />);
  return { ...r, onChange, onConfirm, onCancel };
}

test('shows the words as typed, the video, the spec line and the price on Create', () => {
  mount(ask());
  expect(screen.getByTestId('edit-prompt').textContent).toBe('„გააღამე“');
  const video = screen.getByTestId('edit-video') as HTMLVideoElement;
  expect(video.getAttribute('src')).toBe(VIDEO.url);
  expect(video.getAttribute('poster')).toBe(VIDEO.poster);
  expect(screen.getByTestId('edit-spec').textContent).toBe('Edit · 5 s · 720p · Gemini Omni Flash');
  const create = screen.getByTestId('edit-confirm');
  expect(create.getAttribute('data-price')).toBe('48');
  expect(create.getAttribute('data-live-guard')).toBe('spend');
  expect(create.textContent).toContain('✦ 48');
  expect(screen.getByTestId('edit-op-edit').getAttribute('aria-pressed')).toBe('true');
  // An edit keeps the video's own length: no length chips.
  expect(screen.queryByTestId('edit-len-8')).toBeNull();
  expect(screen.getByTestId('edit-res-720p').textContent).toContain('✦ 48');
  expect(screen.getByTestId('edit-res-1080p').textContent).toContain('✦ 68');
});

test('Extend shows +4 · 6 · 8 · 10 s, and every chip hands back the order priced again', () => {
  const { onChange } = mount(ask({ op: 'extend' }));
  expect(screen.getByTestId('edit-len-8').getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByTestId('edit-len-10'));
  expect(onChange.mock.calls[0][0]).toMatchObject({ seconds: 10, credits: 74, phase: 'ask' });
  fireEvent.click(screen.getByTestId('edit-res-1080p'));
  expect(onChange.mock.calls[1][0]).toMatchObject({ resolution: '1080p', credits: 88 });
  fireEvent.click(screen.getByTestId('edit-op-edit'));
  expect(onChange.mock.calls[2][0]).toMatchObject({ op: 'edit', credits: 48 });
});

test('an op the video cannot take is disabled: a 2 s video can be extended, not edited', () => {
  mount(ask({ op: 'extend', inputSec: 2 }));
  expect((screen.getByTestId('edit-op-edit') as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByTestId('edit-op-extend') as HTMLButtonElement).disabled).toBe(false);
});

test('Create and Cancel; once Create was pressed nothing can change; running says what is being made', () => {
  const { onConfirm, onCancel, rerender, onChange } = mount(ask());
  fireEvent.click(screen.getByTestId('edit-confirm'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByTestId('edit-cancel'));
  expect(onCancel).toHaveBeenCalledTimes(1);

  rerender(<EditAskCard ask={{ ...ask(), phase: 'starting' }} locale="en" onChange={onChange} onConfirm={onConfirm} onCancel={onCancel} />);
  expect((screen.getByTestId('edit-confirm') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByTestId('edit-cancel')).toBeNull();
  fireEvent.click(screen.getByTestId('edit-res-1080p'));
  expect(onChange).not.toHaveBeenCalled();

  rerender(<EditAskCard ask={{ ...ask({ op: 'extend' }), phase: 'running' }} locale="en" onChange={onChange} onConfirm={onConfirm} onCancel={onCancel} />);
  expect(screen.getByTestId('edit-running').textContent).toMatch(/Extending the video/);
  expect(screen.queryByTestId('edit-confirm')).toBeNull();
});

test('a cancelled card says nothing was charged', () => {
  mount({ ...ask(), phase: 'cancelled' }, 'ka');
  expect(screen.getByTestId('edit-cancelled').textContent).toBe('გაუქმდა. თანხა არ ჩამოგეჭრა.');
  expect(screen.queryByTestId('edit-card')).toBeNull();
});
