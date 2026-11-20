/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { NotionDraftCard } from './NotionDraftCard';

const draft = { parentId: '12345678123412341234123456789abc', title: 'Plan', text: 'Body' };
const reply = (status: number, body: unknown) => ({ ok: status === 200, status, json: async () => body }) as Response;

test('nothing is saved until Save; Save posts the draft and shows the link', async () => {
  global.fetch = jest.fn(async () => reply(200, { ok: true, id: 'x', url: 'https://www.notion.so/x' })) as jest.Mock;
  render(<NotionDraftCard draft={draft} locale="en" />);
  expect(screen.getByText('Nothing is saved yet.')).toBeTruthy();
  expect(global.fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('notion-draft-save'));
  expect(await screen.findByText('Saved.')).toBeTruthy();
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/connectors/notion/pages');
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual(draft);
  expect(screen.getByText('Open').getAttribute('href')).toBe('https://www.notion.so/x');
});

test('a lost link or an unshared page is said in Georgian', async () => {
  global.fetch = jest.fn(async () => reply(409, { error: 'not_connected' })) as jest.Mock;
  render(<NotionDraftCard draft={draft} locale="ka" />);
  fireEvent.click(screen.getByTestId('notion-draft-save'));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Notion არ არის დაკავშირებული. დააკავშირე კონექტორების ღილაკიდან.');
});
