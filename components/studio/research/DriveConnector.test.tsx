import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DriveConnector } from './DriveConnector';

let callback: (data: { action: string }) => void;
const dispose = jest.fn();
const visible = jest.fn();
const origin = jest.fn();
const size = jest.fn();
const mode = jest.fn();
const load = jest.fn();
jest.mock('./googlePicker', () => ({ loadGooglePicker: () => load() }));

beforeEach(() => {
  jest.clearAllMocks();
  load.mockResolvedValue(undefined);
  const builder = {
    addView: () => builder, enableFeature: () => builder, setOAuthToken: () => builder,
    setDeveloperKey: () => builder, setAppId: () => builder, setLocale: () => builder,
    setOrigin: (v: string) => { origin(v); return builder; },
    setSize: (w: number, h: number) => { size(w, h); return builder; },
    setCallback: (cb: typeof callback) => { callback = cb; return builder; },
    build: () => ({ dispose, setVisible: visible }),
  };
  const view = { setMode: (v: string) => { mode(v); return view; }, setMimeTypes: () => view, setIncludeFolders: () => view, setSelectFolderEnabled: () => view };
  window.google = { picker: {
    DocsView: jest.fn(() => view), PickerBuilder: jest.fn(() => builder),
    ViewId: { DOCS: 'docs' }, DocsViewMode: { LIST: 'list' }, Feature: { MULTISELECT_ENABLED: 'multi' }, Action: { PICKED: 'picked', CANCEL: 'cancel' },
  } };
  global.fetch = jest.fn(async (url: string) => ({
    ok: true, status: 200,
    json: async () => url.endsWith('/picker') ? { accessToken: 'test-token', apiKey: 'test-key', appId: '123' } : { files: [] },
  })) as jest.Mock;
});

test('desktop Picker uses list mode and this origin, refreshes only after selection, and disposes', async () => {
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
  const { unmount } = render(<DriveConnector lang="en" linked onChanged={jest.fn()} />);
  await screen.findByText('No files picked yet.');
  fireEvent.click(screen.getByRole('button', { name: 'Pick files' }));
  await waitFor(() => expect(visible).toHaveBeenCalledWith(true));
  expect(mode).toHaveBeenCalledWith('list');
  expect(origin).toHaveBeenCalledWith(window.location.origin);
  expect(size).toHaveBeenCalledWith(976, 650);
  const calls = (global.fetch as jest.Mock).mock.calls.length;
  act(() => callback({ action: 'cancel' }));
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledTimes(calls);
  fireEvent.click(screen.getByRole('button', { name: 'Pick files' }));
  await waitFor(() => expect(visible).toHaveBeenCalledTimes(2));
  act(() => callback({ action: 'picked' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(calls + 2));
  fireEvent.click(screen.getByRole('button', { name: 'Pick files' }));
  await waitFor(() => expect(visible).toHaveBeenCalledTimes(3));
  unmount();
  expect(dispose).toHaveBeenCalledTimes(3);
});

test('expired grant returns to Connect; failed Picker loading permits a retry', async () => {
  const { unmount } = render(<DriveConnector lang="en" linked onChanged={jest.fn()} />);
  await screen.findByText('No files picked yet.');
  load.mockRejectedValueOnce(new Error('blocked'));
  fireEvent.click(screen.getByRole('button', { name: 'Pick files' }));
  await screen.findByText('Google Drive did not answer. Try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Pick files' }));
  await waitFor(() => expect(visible).toHaveBeenCalledWith(true));
  act(() => callback({ action: 'cancel' }));
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 409 });
  fireEvent.click(screen.getByRole('button', { name: 'Pick files' }));
  await screen.findByRole('button', { name: 'Connect', exact: true });
  unmount();
});
