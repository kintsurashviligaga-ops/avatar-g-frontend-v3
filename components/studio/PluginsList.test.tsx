/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PluginsList, pluginsUiOn } from './PluginsList';

const states = [
  { id: 'google_drive', status: 'ready', connectable: true, linked: true, blockers: [] },
  { id: 'notion', status: 'not_connected', connectable: true, linked: false, blockers: [] },
  { id: 'github', status: 'needs_setup', connectable: true, blockers: ['provider_app_missing'] },
  { id: 'calendar', status: 'partial', connectable: false, blockers: ['google_verification', 'db_paused'] },
];
const reply = (status: number, body: unknown) => ({ ok: status === 200, status, json: async () => body }) as Response;

beforeEach(() => { global.fetch = jest.fn(async () => reply(200, { plugins: states })) as jest.Mock; });

test('off unless NEXT_PUBLIC_AGENT_PLUGINS=1', () => {
  expect(pluginsUiOn()).toBe(false);
});

test('each plugin shows its real state; only a connectable, not-connected one gets Connect; blockers are said (ka)', async () => {
  render(<PluginsList lang="ka" open />);
  await waitFor(() => expect(screen.getByTestId('plugin-row-notion')).toBeTruthy());
  expect(screen.getByTestId('plugin-connect-notion').getAttribute('href')).toBe('/api/connectors/notion/connect?locale=ka');
  expect(screen.queryByTestId('plugin-connect-github')).toBeNull();
  expect(screen.getByTestId('plugin-row-github').textContent).toContain('საჭიროებს გამართვას');
  expect(screen.getByTestId('plugin-row-calendar').textContent).toContain('Google-ის OAuth ვერიფიკაციას');
  expect(screen.getByTestId('plugin-row-calendar').textContent).toContain('ნაწილობრივ');
});

test('a 404 (server flag closed) hides the section; a failure says so with Try again', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce(reply(404, {}));
  const { container, unmount } = render(<PluginsList lang="en" open />);
  await waitFor(() => expect(container.innerHTML).toBe(''));
  unmount();
  (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('net'));
  render(<PluginsList lang="en" open />);
  expect(await screen.findByText('Could not load the status.')).toBeTruthy();
  fireEvent.click(screen.getByTestId('plugins-retry'));
  await waitFor(() => expect(screen.getByTestId('plugin-row-notion')).toBeTruthy());
});

test('a linked Notion can be disconnected; the redirect result is said once and dropped from the URL', async () => {
  window.history.replaceState(null, '', '/ru?notion=error&reason=state');
  (global.fetch as jest.Mock).mockResolvedValueOnce(reply(200, { plugins: [{ id: 'notion', status: 'ready', connectable: true, linked: true, blockers: [] }] }));
  render(<PluginsList lang="ru" open />);
  expect(await screen.findByText('Срок ссылки истёк. Нажмите «Подключить» ещё раз.')).toBeTruthy();
  expect(window.location.search).toBe('');
  fireEvent.click(await screen.findByTestId('plugin-disconnect-notion'));
  await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some((c) => c[0] === '/api/connectors/notion/disconnect')).toBe(true));
  expect(await screen.findByText('Отключено.')).toBeTruthy();
});
