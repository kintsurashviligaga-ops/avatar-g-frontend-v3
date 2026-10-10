/**
 * @jest-environment jsdom
 *
 * MemoryPanel (PART 2, G4): the facts picked out of the user's chats are shown and can be deleted one by one; the
 * switch for picking them is the user's; "delete all" asks once, then deletes everything, in the user's language.
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MemoryPanel from './MemoryPanel';

let calls: Array<{ url: string; method: string; body?: unknown }>;
let deleteAllStatus: number;

beforeEach(() => {
  calls = [];
  deleteAllStatus = 200;
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;
    if (method === 'GET') {
      return reply(200, {
        memories: [{ id: 'm1', user_id: 'u', fact: 'I run a coffee shop', source: 'manual', created_at: '', updated_at: '' }],
        profile: [{ key: 'name', value: 'Gaga', updatedAt: null }, { key: 'age', value: '30', updatedAt: null }],
        autoMemory: true,
      });
    }
    if (method === 'DELETE' && url.includes('all=1')) return reply(deleteAllStatus, deleteAllStatus < 400 ? { ok: true } : { error: 'x' });
    return reply(200, { ok: true });
  });
});

test('shows what was picked up from the chats, in Georgian by default, and deletes one fact by its key', async () => {
  render(<MemoryPanel />);
  expect(await screen.findByText('Gaga')).toBeInTheDocument();
  expect(screen.getByText('შენი საუბრებიდან დამახსოვრებული')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'წაშლა: სახელი' }));
  await waitFor(() => expect(screen.queryByText('Gaga')).not.toBeInTheDocument());
  expect(calls.at(-1)).toEqual({ url: '/api/memory?key=name', method: 'DELETE' });
});

test('the switch turns picking off and says so to the server', async () => {
  render(<MemoryPanel locale="en" />);
  const sw = await screen.findByRole('switch');
  await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
  fireEvent.click(sw);
  await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
  expect(calls.at(-1)).toEqual({ url: '/api/memory', method: 'PATCH', body: { autoMemory: false } });
});

test('delete all asks first; Cancel deletes nothing; the yes deletes everything and says so', async () => {
  render(<MemoryPanel locale="ru" />);
  await screen.findByText('Gaga');
  fireEvent.click(screen.getByTestId('memory-delete-all'));
  expect(screen.getByText('Удалить всё, что Agent G помнит о вас? Это нельзя отменить.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByTestId('memory-delete-all'));
  fireEvent.click(screen.getByTestId('memory-delete-all-confirm'));
  expect(await screen.findByText('Всё удалено.')).toBeInTheDocument();
  expect(screen.queryByText('Gaga')).not.toBeInTheDocument();
  expect(screen.queryByText('I run a coffee shop')).not.toBeInTheDocument();
  expect(calls.filter((c) => c.method === 'DELETE')).toEqual([{ url: '/api/memory?all=1', method: 'DELETE' }]);
});

test('a delete-all that fails says so and shows what is left', async () => {
  deleteAllStatus = 500;
  render(<MemoryPanel locale="en" />);
  await screen.findByText('Gaga');
  fireEvent.click(screen.getByTestId('memory-delete-all'));
  fireEvent.click(screen.getByTestId('memory-delete-all-confirm'));
  expect(await screen.findByText('That did not work. Try again.')).toBeInTheDocument();
  expect(await screen.findByText('Gaga')).toBeInTheDocument();
});
