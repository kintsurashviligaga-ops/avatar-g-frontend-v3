/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectorsButton, connectorRowState } from './ConnectorsButton';

const mockFetchConnectors = jest.fn(async (): Promise<unknown> => ({ ok: true, connectors: [{ id: 'google_drive', label: 'Google Drive', status: 'connectable', linked: true }], limits: null }));
jest.mock('./research/api', () => ({ fetchConnectors: () => mockFetchConnectors() }));
const openConnectors = jest.fn();
jest.mock('./research/store', () => ({ researchActions: { openConnectors: () => openConnectors() } }));

describe('ConnectorsButton (GG 2026-11-07: beside „+")', () => {
  test('lists Drive with its real state and Gmail/Calendar as soon; Drive opens its sheet', async () => {
    render(<ConnectorsButton locale="en" className="" />);
    fireEvent.click(screen.getByTestId('composer-connectors'));
    await waitFor(() => expect(screen.getByTestId('connector-row-google_drive').getAttribute('data-state')).toBe('linked'));
    expect(screen.getByTestId('connector-row-gmail').getAttribute('data-state')).toBe('soon');
    expect(screen.getByTestId('connector-row-premiere').getAttribute('data-state')).toBe('export');
    expect((screen.getByTestId('connector-row-gmail') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('connector-row-google_drive'));
    expect(openConnectors).toHaveBeenCalled();
  });
  test('row state is honest', () => {
    expect(connectorRowState(undefined)).toBe('soon');
    expect(connectorRowState({ status: 'connectable' })).toBe('connect');
    expect(connectorRowState({ status: 'unavailable' })).toBe('off');
    expect(connectorRowState({ status: 'soon', linked: true })).toBe('linked');
  });
  test('Phase 8.13: Drive says „checking" with a spinner while the state loads, never a guessed „soon"', async () => {
    let resolve!: (v: unknown) => void;
    mockFetchConnectors.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    render(<ConnectorsButton locale="ka" className="" />);
    fireEvent.click(screen.getByTestId('composer-connectors'));
    const row = screen.getByTestId('connector-row-google_drive');
    expect(row.getAttribute('data-state')).toBe('loading');
    expect(row.textContent).toContain('მოწმდება…');
    expect((row as HTMLButtonElement).disabled).toBe(true);
    resolve({ ok: true, connectors: [{ id: 'google_drive', label: 'Google Drive', status: 'connectable', linked: false }], limits: null });
    await waitFor(() => expect(row.getAttribute('data-state')).toBe('connect'));
    expect(row.textContent).toContain('დაკავშირება');
  });
  test('Phase 8.13: a failed or thrown state check reads „unavailable", and Drive is not tappable', async () => {
    mockFetchConnectors.mockImplementationOnce(async () => { throw new Error('offline'); });
    render(<ConnectorsButton locale="ka" className="" />);
    fireEvent.click(screen.getByTestId('composer-connectors'));
    await waitFor(() => expect(screen.getByTestId('connector-row-google_drive').getAttribute('data-state')).toBe('off'));
    expect(screen.getByTestId('connector-row-google_drive').textContent).toContain('მიუწვდომელია');
    expect((screen.getByTestId('connector-row-google_drive') as HTMLButtonElement).disabled).toBe(true);
  });
});
