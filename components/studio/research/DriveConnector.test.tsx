import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DriveConnector, driveReturnMessage } from './DriveConnector';

let callback: (data: { action: string }) => void;
const dispose = jest.fn();
const visible = jest.fn();
const origin = jest.fn();
const size = jest.fn();
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
  const view = { setMimeTypes: () => view, setIncludeFolders: () => view, setSelectFolderEnabled: () => view };
  window.google = { picker: {
    DocsView: jest.fn(() => view), PickerBuilder: jest.fn(() => builder),
    ViewId: { DOCS: 'docs' }, Feature: { MULTISELECT_ENABLED: 'multi' }, Action: { PICKED: 'picked', CANCEL: 'cancel' },
  } };
  global.fetch = jest.fn(async (url: string) => ({
    ok: true, status: 200,
    json: async () => url.endsWith('/picker') ? { accessToken: 'test-token', apiKey: 'test-key', appId: '123' } : { files: [] },
  })) as jest.Mock;
});

test('mobile Picker fits the viewport, uses this origin, refreshes only after selection, and disposes', async () => {
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
  const { unmount } = render(<DriveConnector lang="en" linked onChanged={jest.fn()} />);
  await screen.findByText('No files picked yet.');
  fireEvent.click(screen.getByRole('button', { name: 'Pick files' }));
  await waitFor(() => expect(visible).toHaveBeenCalledWith(true));
  expect(origin).toHaveBeenCalledWith(window.location.origin);
  expect(size).toHaveBeenCalledWith(366, 650);
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

describe('Phase 8.13 — reconnect, return reasons, connecting state', () => {
  test('a grant that dies while linked says so (ka) and offers Connect, and tells the parent', async () => {
    const onChanged = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'not_connected' }) });
    render(<DriveConnector lang="ka" linked onChanged={onChanged} />);
    expect((await screen.findByRole('status')).textContent).toContain('Google Drive-თან კავშირი გაწყდა. დააკავშირე თავიდან.');
    expect(screen.getByTestId('drive-connect').textContent).toContain('დაკავშირება');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  test('every redirect reason has its own message, in Georgian too', () => {
    expect(driveReturnMessage('linked', null, 'ka')).toBe('დაკავშირებულია.');
    expect(driveReturnMessage('error', 'denied', 'ka')).toBe('დაკავშირება გაუქმდა.');
    expect(driveReturnMessage('error', 'scope_missing', 'ka')).toMatch(/Drive-ის ნებართვა არ მონიშნულა/);
    expect(driveReturnMessage('error', 'state', 'ka')).toMatch(/ვადა გაუვიდა/);
    expect(driveReturnMessage('error', 'no_refresh_token', 'ka')).toMatch(/Google ანგარიშში/);
    expect(driveReturnMessage('error', 'not_signed_in', 'ka')).toMatch(/შედი ანგარიშში/);
    expect(driveReturnMessage('error', 'unavailable', 'ka')).toBe('Google Drive-მა არ უპასუხა. სცადე თავიდან.');
    expect(driveReturnMessage('error', null, 'en')).toBe('Google Drive did not answer. Try again.');
    // No reason falls through to raw English in a Georgian UI.
    for (const r of ['denied', 'scope_missing', 'state', 'no_refresh_token', 'not_signed_in', 'failed', 'x']) {
      expect(driveReturnMessage('error', r, 'ka')).toMatch(/[\u10D0-\u10FF]/);
    }
  });

  test('the redirect result is shown once and dropped from the URL', async () => {
    window.history.replaceState(null, '', '/ka/studio?drive=error&reason=scope_missing&x=1');
    render(<DriveConnector lang="ka" linked={false} onChanged={jest.fn()} />);
    expect((await screen.findByRole('status')).textContent).toContain('Drive-ის ნებართვა არ მონიშნულა');
    expect(window.location.search).toBe('?x=1');
    window.history.replaceState(null, '', '/');
  });

  test('Connect shows a spinner and cannot start a second flow; coming back re-enables it', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {}); // jsdom: "navigation not implemented"
    render(<DriveConnector lang="ka" linked={false} onChanged={jest.fn()} />);
    const b = screen.getByTestId('drive-connect');
    fireEvent.click(b);
    expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.textContent).toContain('Google იხსნება…');
    act(() => { window.dispatchEvent(new Event('pageshow')); });
    expect((b as HTMLButtonElement).disabled).toBe(false);
    expect(b.textContent).toContain('დაკავშირება');
    err.mockRestore();
  });
});

test('a blocked Picker explains the browser fix and offers Try again, which opens the Picker', async () => {
  render(<DriveConnector lang="en" linked onChanged={jest.fn()} />);
  await screen.findByText('No files picked yet.');
  load.mockRejectedValueOnce(new Error('picker_timeout'));
  fireEvent.click(screen.getByRole('button', { name: 'Pick files' }));
  expect(await screen.findByText(/Prevent Cross-Site Tracking/)).toBeTruthy();
  fireEvent.click(screen.getByTestId('drive-pick-retry'));
  await waitFor(() => expect(visible).toHaveBeenCalledWith(true));
  expect(screen.queryByTestId('drive-pick-retry')).toBeNull();
});

test('the Picker reporting an error itself is said, disposed and retryable', async () => {
  render(<DriveConnector lang="ka" linked onChanged={jest.fn()} />);
  await screen.findByText('ჯერ ფაილი არ აგირჩევია.');
  fireEvent.click(screen.getByTestId('drive-pick'));
  await waitFor(() => expect(visible).toHaveBeenCalledWith(true));
  act(() => callback({ action: 'error' }));
  expect(dispose).toHaveBeenCalled();
  expect(await screen.findByText(/შეცდომა დააბრუნა/)).toBeTruthy();
  expect(screen.getByTestId('drive-pick-retry').textContent).toBe('თავიდან ცდა');
});

test('pickFailureMessage: loader codes get the browser advice, anything else the plain retry line', () => {
  const { pickFailureMessage } = jest.requireActual('./DriveConnector') as typeof import('./DriveConnector');
  for (const c of ['gapi_load', 'picker_load', 'picker_timeout', 'picker_missing']) expect(pickFailureMessage(new Error(c), 'ru')).toMatch(/Safari/);
  expect(pickFailureMessage(new Error('boom'), 'en')).toBe('Google Drive did not answer. Try again.');
  expect(pickFailureMessage('x', 'en')).toBe('Google Drive did not answer. Try again.');
});
