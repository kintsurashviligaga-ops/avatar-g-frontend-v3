/**
 * The Agent Terminal speaks the page's language and never prints the server's own error text (Phase 7.6).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentTerminal from './AgentTerminal';
import { TERMINAL_COPY, terminalErrorText } from './agentTerminalCopy';

jest.mock('./PlanStartCard', () => ({ PlanStartCard: () => null }));

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

const answer = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

test('Georgian by default: title, button and suggestions are Georgian', () => {
  render(<AgentTerminal locale="ka" />);
  expect(screen.getByRole('heading', { name: TERMINAL_COPY.ka.title })).toBeTruthy();
  expect(screen.getByTestId('agent-terminal-run').textContent).toBe('გაშვება');
  expect(screen.getByText(TERMINAL_COPY.ka.suggestions[0]!)).toBeTruthy();
  expect(screen.queryByText(/Agent Terminal$/)).toBeNull();
});

test.each(['en', 'ru'] as const)('%s copy is used', (l) => {
  render(<AgentTerminal locale={l} />);
  expect(screen.getByRole('heading', { name: TERMINAL_COPY[l].title })).toBeTruthy();
});

test('a server error shows our sentence, never the raw text', async () => {
  fetchMock.mockReturnValueOnce(answer(413, { error: 'goal too long (max 2000)' }));
  render(<AgentTerminal locale="ka" />);
  fireEvent.change(screen.getByTestId('agent-terminal-goal'), { target: { value: 'test goal' } });
  fireEvent.click(screen.getByTestId('agent-terminal-run'));
  await waitFor(() => expect(screen.getByTestId('agent-terminal-error').textContent).toBe(TERMINAL_COPY.ka.errors.tooLong));
  expect(screen.queryByText(/max 2000/)).toBeNull();
});

test('signed out and network errors are human sentences', async () => {
  fetchMock.mockReturnValueOnce(answer(401, { error: 'unauthenticated' }));
  render(<AgentTerminal locale="en" />);
  fireEvent.change(screen.getByTestId('agent-terminal-goal'), { target: { value: 'x' } });
  fireEvent.click(screen.getByTestId('agent-terminal-run'));
  await waitFor(() => expect(screen.getByTestId('agent-terminal-error').textContent).toBe(TERMINAL_COPY.en.errors.signIn));
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByTestId('agent-terminal-run'));
  await waitFor(() => expect(screen.getByTestId('agent-terminal-error').textContent).toBe(TERMINAL_COPY.en.errors.network));
});

test('a finished run shows the localized stop badge and tool labels', async () => {
  fetchMock.mockReturnValueOnce(answer(200, { answer: 'done', stopReason: 'final', steps: [{ thought: 'look', tool: 'web_search', input: { q: 'x' }, observation: 'ok' }, { final: 'done' }] }));
  render(<AgentTerminal locale="ka" />);
  fireEvent.change(screen.getByTestId('agent-terminal-goal'), { target: { value: 'x' } });
  fireEvent.click(screen.getByTestId('agent-terminal-run'));
  await waitFor(() => expect(screen.getByText('ძიება ვებში')).toBeTruthy());
  expect(screen.getByText(/დასრულდა/)).toBeTruthy();
});

test('terminalErrorText maps statuses; unknown → generic', () => {
  expect(terminalErrorText(429, 'ka')).toBe(TERMINAL_COPY.ka.errors.rateLimited);
  expect(terminalErrorText(400, 'ru')).toBe(TERMINAL_COPY.ru.errors.invalid);
  expect(terminalErrorText(500, 'en')).toBe(TERMINAL_COPY.en.errors.generic);
});
