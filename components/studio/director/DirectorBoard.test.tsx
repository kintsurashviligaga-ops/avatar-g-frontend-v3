/**
 * @jest-environment jsdom
 *
 * The Director's Workflow scene cards: each card shows its own price, the total sits under them, a problem blocks
 * "Create film", and editing a card re-prices it. Nothing here calls the network.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { emptyScene, quoteProject, type DwProject } from '@/lib/video/directorsWorkflow';
import { DirectorBoard } from './DirectorBoard';

const board = (): DwProject => ({
  id: 'p1', title: 'Café', logline: 'Two friends meet', aspect: '9:16', resolution: '720p',
  characters: [{ id: 'nino', name: 'Nino', look: 'woman, 30, red coat', voice: 'female' }],
  scenes: [
    { ...emptyScene('s1'), order: 1, title: 'One', action: 'Nino enters a café.', firstFrame: 'none', characterIds: ['nino'],
      audio: { lines: [{ characterId: 'nino', text: 'გამარჯობა!' }], ambience: '', effects: [], music: null } },
    { ...emptyScene('s2'), order: 2, title: 'Two', action: 'Nino sits at the window.', firstFrame: 'previous' },
  ],
  status: 'draft', version: 1,
});

test('cards show per-scene prices and the total; approve sends exactly that version and price', () => {
  const onApprove = jest.fn();
  const p = board();
  render(<DirectorBoard locale="en" onClose={() => {}} onApprove={onApprove} initial={p} />);
  const q = quoteProject(p);
  expect(screen.getAllByTestId('dw-scene')).toHaveLength(2);
  const prices = screen.getAllByTestId('dw-scene-price').map((n) => n.textContent);
  expect(prices[0]).toContain(String(q.scenes[0]!.credits));
  expect(screen.getByTestId('dw-total').textContent).toContain(String(q.totalCredits));
  const approve = screen.getByTestId('dw-approve') as HTMLButtonElement;
  expect(approve.disabled).toBe(false);
  fireEvent.click(approve);
  expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', version: 1 }), expect.objectContaining({ totalCredits: q.totalCredits }));
});

test('a problem on a card blocks Create film; without onApprove the button stays disabled', () => {
  const p = board();
  p.scenes[0]!.characterIds = []; // Nino speaks but is not on screen
  const { unmount } = render(<DirectorBoard locale="en" onClose={() => {}} onApprove={() => {}} initial={p} />);
  expect((screen.getByTestId('dw-approve') as HTMLButtonElement).disabled).toBe(true);
  expect(within(screen.getAllByTestId('dw-scene')[0]!).getByRole('alert')).toBeTruthy();
  unmount();
  render(<DirectorBoard locale="en" onClose={() => {}} initial={board()} />);
  expect((screen.getByTestId('dw-approve') as HTMLButtonElement).disabled).toBe(true);
});

test('removing a card re-prices the film', () => {
  const p = board();
  render(<DirectorBoard locale="en" onClose={() => {}} onApprove={() => {}} initial={p} />);
  const second = screen.getAllByTestId('dw-scene')[1]!;
  fireEvent.click(within(second).getByRole('button', { name: /delete|remove/i }));
  expect(screen.getAllByTestId('dw-scene')).toHaveLength(1);
  expect(screen.getByTestId('dw-total').textContent).toContain(String(quoteProject(p).scenes[0]!.credits));
});

test('Phase 8.24: while the storyboard is written its shape shimmers, and the close button is a 44 px target', async () => {
  (global as unknown as { fetch: unknown }).fetch = jest.fn(() => new Promise(() => {}));
  render(<DirectorBoard locale="ru" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Идея'), { target: { value: 'Лиса в снегу' } });
  fireEvent.click(screen.getByTestId('dw-plan'));
  const sk = await screen.findByTestId('dw-plan-skeleton');
  expect(sk.getAttribute('role')).toBe('status');
  expect(sk.textContent).toBe('Пишем раскадровку…');
  expect(screen.getByLabelText('Закрыть').className).toContain('h-11 w-11');
});
